/* 普通入口连续墙视觉契约：只验 drawWalls 的格网几何与状态绘制。 */
'use strict';

function wallSpy(){
  var style={ fillStyle:'', strokeStyle:'', lineWidth:1, lineCap:'butt' };
  var stack=[], path={ rects:[], segments:[], cursor:null };
  var calls={ fills:[], strokes:[], fillRects:[], strokeRects:[], arcs:[] };
  var ctx={ calls:calls };
  ['fillStyle','strokeStyle','lineWidth','lineCap'].forEach(function(k){
    Object.defineProperty(ctx,k,{ get:function(){return style[k];}, set:function(v){style[k]=v;} });
  });
  ctx.save=function(){ stack.push(Object.assign({},style)); };
  ctx.restore=function(){ if(stack.length) style=stack.pop(); };
  ctx.beginPath=function(){ path={ rects:[], segments:[], cursor:null }; };
  ctx.rect=function(x,y,w,h){ path.rects.push([x,y,w,h]); };
  ctx.moveTo=function(x,y){ path.cursor=[x,y]; };
  ctx.lineTo=function(x,y){ if(path.cursor) path.segments.push([path.cursor[0],path.cursor[1],x,y]); path.cursor=[x,y]; };
  ctx.fill=function(){ calls.fills.push({style:style.fillStyle,rects:path.rects.slice(),segments:path.segments.slice()}); };
  ctx.stroke=function(){ calls.strokes.push({style:style.strokeStyle,width:style.lineWidth,segments:path.segments.slice()}); };
  ctx.fillRect=function(x,y,w,h){ calls.fillRects.push({style:style.fillStyle,x:x,y:y,w:w,h:h}); };
  ctx.strokeRect=function(x,y,w,h){ calls.strokeRects.push({style:style.strokeStyle,x:x,y:y,w:w,h:h}); };
  ctx.arc=function(x,y,r){ calls.arcs.push({style:style.fillStyle,x:x,y:y,r:r}); };
  return ctx;
}

function drawWallShape(buildings){
  var ctx=wallSpy();
  window.APH.state={ colony:{ buildings:buildings }, entities:[] };
  window.APH.Ent.bindCtx(ctx);
  window.APH.Ent.drawWalls(0);
  return ctx.calls;
}

function outerSegments(calls){
  var out=[];
  calls.strokes.forEach(function(c){ if(c.style==='#4a4138') out=out.concat(c.segments); });
  return out;
}

function assertShape(name,cells,expectedEdges){
  test('drawWalls: '+name+' 连续填充且只描外边',function(){
    var calls=drawWallShape(cells.map(function(p){return {id:p[2]||'bl_wall',x:p[0]*48,y:p[1]*48};}));
    var base=calls.fills.filter(function(c){return c.style==='#d8c7a3';});
    if(base.length!==1) throw new Error('暖奶油底应一次填充，实际 '+base.length);
    if(base[0].rects.length!==cells.length) throw new Error('底色格数错误: '+base[0].rects.length);
    var edges=outerSegments(calls);
    if(edges.length!==expectedEdges) throw new Error('外边数应 '+expectedEdges+'，实际 '+edges.length+': '+JSON.stringify(edges));
  });
}

assertShape('横线',[[0,0],[1,0]],6);
assertShape('竖线',[[0,0],[0,1]],6);
assertShape('L形',[[0,0],[1,0],[0,1]],8);
assertShape('T形',[[-1,0],[0,0],[1,0],[0,1]],10);
assertShape('十字',[[0,0],[-1,0],[1,0],[0,-1],[0,1]],12);
assertShape('墙门',[[0,0],[1,0,'bl_gate']],6);

test('drawWalls: 墙门接缝不描边，生产门维持关闭表现',function(){
  var closed=drawWallShape([{id:'bl_wall',x:0,y:0},{id:'bl_gate',x:48,y:0}]);
  var seam=outerSegments(closed).filter(function(s){
    return s[0]===21.5 && s[1]===-24 && s[2]===21.5 && s[3]===24 ||
           s[0]===26.5 && s[1]===-24 && s[2]===26.5 && s[3]===24;
  });
  if(seam.length) throw new Error('墙门内部接缝不应描暗框: '+JSON.stringify(seam));
  var closedSlab=closed.fillRects.filter(function(c){return c.style==='#9a6f3f';});
  if(closedSlab.length!==1) throw new Error('生产门没有开合状态，应稳定画一整片关闭门板');
});

test('drawWalls: 偏移格网中心仍按真实48px邻接',function(){
  var calls=drawWallShape([{id:'bl_wall',x:600,y:600},{id:'bl_wall',x:648,y:600}]);
  var base=calls.fills.find(function(c){return c.style==='#d8c7a3';});
  if(!base || JSON.stringify(base.rects)!==JSON.stringify([[576,576,48,48],[624,576,48,48]]))
    throw new Error('偏移墙必须保留原中心绘制: '+JSON.stringify(base&&base.rects));
  if(outerSegments(calls).length!==6) throw new Error('真实中心差48仍应连接');
});

test('drawWalls: 单墙非整数倍中心不被渲染层吸格',function(){
  var calls=drawWallShape([{id:'bl_wall',x:605.5,y:617.25}]);
  var base=calls.fills.find(function(c){return c.style==='#d8c7a3';});
  var rect=base&&base.rects[0];
  if(!rect || rect[0]!==581.5 || rect[1]!==593.25 || rect[2]!==48 || rect[3]!==48)
    throw new Error('bounds 应以原中心计算: '+JSON.stringify(rect));
});

test('drawWalls: fallback 相邻格没有逐格内框或 inset 色带',function(){
  var old=window.APH.BuildArt;
  try{
    window.APH.BuildArt={ fillMaterial:function(){ return false; } };
    var calls=drawWallShape([{id:'bl_wall',x:600,y:600},{id:'bl_wall',x:648,y:600}]);
    if(calls.strokeRects.length) throw new Error('fallback 禁止逐格 strokeRect: '+JSON.stringify(calls.strokeRects));
    if(calls.fillRects.length) throw new Error('纯墙 fallback 禁止逐格 fillRect 色带: '+JSON.stringify(calls.fillRects));
    var seam=calls.strokes.reduce(function(out,c){return out.concat(c.segments);},[]).filter(function(s){
      return s[0]===624 && s[2]===624 || s[1]===600 && s[3]===600 && Math.min(s[0],s[2])<=624 && Math.max(s[0],s[2])>=624;
    });
    if(seam.length) throw new Error('内部接缝不得有任何 fallback 线段: '+JSON.stringify(seam));
  }finally{
    if(old===undefined) delete window.APH.BuildArt; else window.APH.BuildArt=old;
  }
});

test('drawWalls: 半血墙保留裂纹与24px耐久条',function(){
  var max=(window.APH.CFG.wall&&window.APH.CFG.wall.hp)||60;
  var calls=drawWallShape([{id:'bl_wall',x:96,y:96,hp:max/2}]);
  var bg=calls.fillRects.find(function(c){return c.style==='#1a2334';});
  var hp=calls.fillRects.find(function(c){return c.style==='#ff9a9a';});
  var crack=calls.strokes.find(function(c){return c.style==='#765348';});
  if(!bg || bg.w!==24 || bg.h!==3) throw new Error('耐久底条必须保留24×3');
  if(!hp || hp.w!==12 || hp.h!==3) throw new Error('半血前景条应12×3');
  if(!crack || !crack.segments.length) throw new Error('受损墙应有裂纹');
});

test('drawWalls: BuildArt 墙材质可选，失败时不影响代码材质',function(){
  var old=window.APH.BuildArt, seen=[];
  try{
    window.APH.BuildArt={ fillMaterial:function(ctx,kind,x,y,w,h){ seen.push([kind,x,y,w,h]); return true; } };
    var calls=drawWallShape([{id:'bl_wall',x:0,y:0},{id:'bl_gate',x:48,y:0}]);
    if(seen.length!==2 || seen.some(function(c){return c[0]!=='wall'||c[3]!==48||c[4]!==48;}))
      throw new Error('每个结构格应请求48px墙材质: '+JSON.stringify(seen));
    if(calls.strokes.some(function(c){return c.style==='#bca57e';})) throw new Error('材质成功后不应再叠代码划痕');
  }finally{
    if(old===undefined) delete window.APH.BuildArt; else window.APH.BuildArt=old;
  }
});
