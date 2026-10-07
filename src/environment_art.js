/* Environment atlas: generated transparent assets, world anchors remain logical. */
window.APH=window.APH||{};
APH.EnvironmentArt=(function(){
  'use strict';
  var image=null,status='idle';
  var names=['tree_a','tree_b','berry','herb','stone','iron','wreck','cargo','glow','crystal','dew','star'];
  var sizes=APH.CFG.visual.environmentSizes;
  function load(){
    if(status!=='idle')return;
    if(typeof Image==='undefined'||!APH.ENVIRONMENT_ART_DATA){status='error';return;}
    status='loading';image=new Image();
    image.onload=function(){status=(image.naturalWidth===1024&&image.naturalHeight===768)?'ready':'error';};
    image.onerror=function(){status='error';};
    image.src=APH.ENVIRONMENT_ART_DATA;
  }
  function draw(ctx,name,x,y,w,h){
    if(status!=='ready')return false;
    var i=names.indexOf(name);if(i<0)return false;
    var size=sizes[name],bounds=APH.ENVIRONMENT_ART_FRAMES&&APH.ENVIRONMENT_ART_FRAMES[name];
    if(!bounds)return false;
    var scale=Math.min((w||size[0])/bounds[2],(h||size[1])/bounds[3]);
    var dw=bounds[2]*scale,dh=bounds[3]*scale;
    ctx.drawImage(image,bounds[0],bounds[1],bounds[2],bounds[3],x-dw/2,y-dh,dw,dh);
    return true;
  }
  return {load:load,isReady:function(){return status==='ready';},draw:draw,names:names,sizes:sizes};
})();
