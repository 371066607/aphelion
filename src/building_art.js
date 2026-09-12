/* Warm settlement atlas. Loading is explicit; ordinary game startup stays lazy. */
window.APH = window.APH || {};
APH.BuildArt = (function(){
  'use strict';
  var atlas = null, status = 'idle', listeners = [], materials = {};
  var patterns = new WeakMap();
  /* Measured from the generated 1254px master, including each tight contact shadow.
     The generator does not promise exact cell alignment: never infer sprite bounds. */
  var MASTER_SIZE=1254;
  var frames = {
    bl_bed:[78,24,144,292], bl_clinic:[353,23,148,293],
    bl_dining_chair:[628,46,180,237], bl_dining_table:[907,23,274,286],
    bl_lab:[27,372,237,194], bl_kitchen:[304,379,242,187],
    bl_workshop:[573,365,306,202], bl_storage_shelf:[894,389,334,180],
    bl_wood_generator:[27,632,235,238], bed_teal:[70,899,144,304],
    gate_closed:[272,977,298,184], gate_open:[598,977,300,188],
    scrub:[933,946,270,255]
  };
  var swatches = { floor:[304,632,250,250], wall:[617,633,254,248], ground:[930,633,257,248] };

  function finish(ok){
    status = ok ? 'ready' : 'error';
    var pending = listeners; listeners = [];
    pending.forEach(function(fn){ fn(ok); });
  }
  function load(callback){
    if(status==='ready'||status==='error'){ if(callback) callback(status==='ready'); return; }
    if(callback) listeners.push(callback);
    if(status==='loading') return;
    if(typeof Image==='undefined'||!APH.BUILD_ART_DATA){ finish(false); return; }
    status='loading'; atlas=new Image();
    atlas.onload=function(){
      var w=atlas.naturalWidth||atlas.width, h=atlas.naturalHeight||atlas.height;
      finish(w>=64 && w===h);
    };
    atlas.onerror=function(){ finish(false); };
    atlas.src=APH.BUILD_ART_DATA;
  }
  function isReady(){ return status==='ready'; }
  function sample(ctx,source,x,y,w,h){
    var scale=(atlas.naturalWidth||atlas.width)/MASTER_SIZE;
    ctx.drawImage(atlas,source[0]*scale,source[1]*scale,source[2]*scale,source[3]*scale,x,y,w,h);
  }
  function drawSprite(ctx,name,x,y,w,h){
    if(!isReady()||!frames[name]) return false;
    sample(ctx,frames[name],x,y,w,h); return true;
  }
  function materialCanvas(name){
    if(materials[name]) return materials[name];
    var size=name==='ground'?512:96, canvas;
    if(typeof OffscreenCanvas!=='undefined') canvas=new OffscreenCanvas(size,size);
    else if(typeof document!=='undefined') { canvas=document.createElement('canvas');canvas.width=size;canvas.height=size; }
    if(!canvas) return null;
    var ctx=canvas.getContext('2d');
    if(name==='ground'){
      /* Mirroring makes opposing edges meet; no visible square terrain seams. */
      for(var row=0;row<2;row++) for(var col=0;col<2;col++){
        ctx.save();ctx.translate(col?size:0,row?size:0);ctx.scale(col?-1:1,row?-1:1);
        sample(ctx,swatches[name],0,0,size/2,size/2);ctx.restore();
      }
      ctx.fillStyle='rgba(112,100,53,.32)';ctx.fillRect(0,0,size,size);
    }else sample(ctx,swatches[name],0,0,size,size);
    materials[name]=canvas;return canvas;
  }
  function fillMaterial(ctx,name,x,y,w,h){
    if(!isReady()||!swatches[name]) return false;
    var canvas=materialCanvas(name);
    if(!canvas){sample(ctx,swatches[name],x,y,w,h);return true;}
    var cache=patterns.get(ctx);
    if(!cache){cache={};patterns.set(ctx,cache);}
    if(!cache[name]) cache[name]=ctx.createPattern(canvas,'repeat');
    ctx.fillStyle=cache[name];ctx.fillRect(x,y,w,h);return true;
  }
  return { load:load, isReady:isReady, drawSprite:drawSprite, fillMaterial:fillMaterial };
})();
