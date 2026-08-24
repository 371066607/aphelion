/* ============================================================
   Aphelion · sprites.js — 序列帧资产管理 (M1)
   挂载: window.APH.Sprites
   职责:
     - 注册表: 每个动画 = {src(base64/URL), fw, fh, frames, fps, loop}
     - 加载: Image onload 后按格切帧坐标(纯函数 frameRect 可测)
     - 动画推进: advance(animState, dt) 纯函数返回新帧号
     - 绘制: draw(ctx2d, name, x, y, opts) 到世界坐标系
   无图时 isReady()===false, 调用方可回退程序化绘制。
   ============================================================ */
window.APH = window.APH || {};

APH.Sprites = (function(){
  'use strict';

  /* ---------- 注册表 ---------- */
  var SHEETS = {};          // name -> def {src,fw,fh,cols,rows,count,fps,loop}
  var IMAGES = {};          // name -> HTMLImageElement | null
  var readyCount = 0;
  var TINTED = {};                    // name -> 环境融合版canvas

  function define(name, def){
    SHEETS[name] = {
      src: def.src,
      fw: def.fw || 64,
      fh: def.fh || 64,
      cols: def.cols || 4,
      rows: def.rows || 1,
      count: def.count || (def.cols||4)*(def.rows||1),
      fps: def.fps || 6,
      loop: def.loop !== false,
      anchorY: def.anchorY || 0.9,        // 底部锚点比例(建筑落地感)
    };
    return SHEETS[name];
  }

  /* 批量加载全部已注册的 sheet。onReady 在全部完成后回调一次。 */
  function loadAll(onReady){
    var names = Object.keys(SHEETS);
    if (!names.length){ if(onReady) onReady(); return; }
    var pending = names.length;
    names.forEach(function(name){
      var d = SHEETS[name];
      var img = new Image();
      img.onload = function(){
        /* 强制完整解码后再标记ready, 避免首帧drawImage画出半解码白条 */
        var done = function(){ if(--pending<=0 && onReady) onReady(); };
        var finish = function(){
          /* 预烘焙"环境融合版": 降饱和35%+暗青tint, 用于夜晚/远景 */
          try{
            var c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
            var g=c.getContext('2d');
            g.drawImage(img,0,0);
            var id=g.getImageData(0,0,c.width,c.height), px=id.data;
            for(var i=0;i<px.length;i+=4){
              if(px[i+3]<8) continue;
              var lum=px[i]*.3+px[i+1]*.59+px[i+2]*.11;
              px[i]  =Math.round(px[i]  *.62+lum*.22+6);   // 降饱和+暗部偏绿
              px[i+1]=Math.round(px[i+1]*.62+lum*.26+10);
              px[i+2]=Math.round(px[i+2]*.62+lum*.22+14);
            }
            g.putImageData(id,0,0);
            TINTED[name]=c;
          }catch(e){ /* 跨域等异常忽略 */ }
          IMAGES[name] = img;
          done();
        };
        if (img.decode) {
          img.decode().then(finish).catch(function(){
            IMAGES[name] = null; done();
          });
        } else { finish(); }
      };
      img.onerror = function(){
        IMAGES[name] = null;               // 标记失败, isReady 返回 false
        if (--pending <= 0 && onReady) onReady();
      };
      img.src = d.src;
    });
  }
  function sheetDef(name){ return SHEETS[name]; }
  function isReady(name){
    var d = SHEETS[name];
    if (!d) return false;
    return !!IMAGES[name];
  }
  function allRegistered(){ return Object.keys(SHEETS); }

  /* ---------- 纯函数: 帧矩形 ---------- */
  /* index(0..count-1) → {sx,sy} 源切点 */
  function framePos(def, index){
    var i = ((index % def.count) + def.count) % def.count;
    return {
      sx: (i % def.cols) * def.fw,
      sy: Math.floor(i / def.cols) * def.fh
    };
  }
  /* 动画推进纯函数: state={t,frame}, dt秒 → 新state。loop=false 时停在末帧 */
  function advance(state, def, dt){
    var t = state.t + dt;
    var step = 1/def.fps;
    while (t >= step){
      t -= step;
      var f = state.frame + 1;
      if (f >= def.count){
        if (def.loop) f = 0;
        else { f = def.count-1; t = 0; }
      }
      state = { t:t, frame:f };
    }
    return state;
  }
  /* 从0时刻起 dt 秒后应显示的帧号(无状态便捷式) */
  function frameAt(def, dt){
    var f = Math.floor(dt * def.fps);
    return def.loop ? (f % def.count) : Math.min(f, def.count-1);
  }

  /* ---------- 绘制 ---------- */
  /* 以底部中心为锚点画第 index 帧, scale 控制显示大小 */
  /* 玩家专用: 2列x4行布局。dir 0=下1=左2=右3=上; step 0=站立1=迈步 */
  function drawPlayerFrame(g, name, dir, step, x, y, scale){
    var img = IMAGES[name];
    if (!img || !img.width) return false;
    var fw = img.width/2, fh = img.height/4;
    var sx = (step?1:0)*fw, sy = dir*fh;
    g.drawImage(img, sx, sy, fw, fh, x, y, fw*scale, fh*scale);
    return true;
  }

  function draw(ctx2d, name, x, y, index, scale){
    var d = SHEETS[name], img = IMAGES[name];
    if (!d || !img) return false;
    var pos = framePos(d, index);
    var sc = scale || 1;
    var w = d.fw*sc, h = d.fh*sc;
    ctx2d.drawImage(img,
      pos.sx, pos.sy, d.fw, d.fh,
      x - w/2, y - h*d.anchorY, w, h);
    return true;
  }

  return {
    define:define, loadAll:loadAll, isReady:isReady, allRegistered:allRegistered,
    framePos:framePos, advance:advance, frameAt:frameAt,
    draw:draw, drawPlayerFrame:drawPlayerFrame, sheetDef:sheetDef,
    getTinted:function(n){ return TINTED[n]; },
    _images:IMAGES,
  };
})();
