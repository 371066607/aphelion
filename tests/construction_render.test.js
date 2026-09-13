'use strict';
require('../src/build_grid.js');
require('../src/construction.js');

function painter(){
  var calls=[];
  return {calls:calls,save:function(){},restore:function(){},translate:function(x,y){calls.push(['translate',x,y]);},rotate:function(r){calls.push(['rotate',r]);},beginPath:function(){},ellipse:function(){},fill:function(){},stroke:function(){},fillRect:function(x,y,w,h){calls.push(['fillRect',x,y,w,h]);},strokeRect:function(){},arc:function(){},rect:function(x,y,w,h){calls.push(['rect',x,y,w,h]);},setLineDash:function(){},fillText:function(){},moveTo:function(){},lineTo:function(){},
    set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set lineDashOffset(v){},set lineCap(v){},set font(v){},set textAlign(v){}};
}

test('formal renderer: 新家具按未旋转原始尺寸绘制并以共享rect命中', function(){
  var c=painter(), drawn=[];
  APH.Ent.bindCtx(c);
  APH.BuildArt={drawSprite:function(ctx,id,x,y,w,h){drawn.push([id,x,y,w,h]);return true;}};
  APH.state={colony:{scene:{width:480,height:480,grid:48},buildings:[]}};
  var r=APH.Construction.record('bl_dining_table',96,96,1); r.type=APH.CFG.entType.BUILDING;
  APH.Ent.drawBuilding(r,0);
  if(drawn.length!==1 || drawn[0][0]!=='bl_dining_table' || drawn[0][3]!==96 || drawn[0][4]!==96) throw new Error('桌子图必须用未旋转2x2基准尺寸: '+JSON.stringify(drawn));
  if(!APH.Ent.hitBuilding(r,120,120) || APH.Ent.hitBuilding(r,95,120)) throw new Error('命中必须跟随旋转后的共享rect');
});

test('formal renderer: 新蓝图不画成品图并保留共享矩形', function(){
  var c=painter(), sprites=0;
  APH.Ent.bindCtx(c); APH.BuildArt={drawSprite:function(){sprites++;return true;}};
  APH.state={colony:{scene:{width:480,height:480,grid:48},buildings:[]}};
  var r=APH.Construction.record('bl_bed',96,96,1);r.type=APH.CFG.entType.BLUEPRINT;r.progress=.5;
  APH.Ent.drawBuilding(r,1);
  if(sprites) throw new Error('蓝图不可偷画成品');
  if(!c.calls.some(function(x){return x[0]==='translate';})) throw new Error('蓝图未按共享矩形定位');
});

test('formal renderer: 新地板导线与相邻墙走共享格层', function(){
  var c=painter();APH.Ent.bindCtx(c);APH.BuildArt={};
  var f=APH.Construction.record('bl_floor',48,48,0), w=APH.Construction.record('bl_wall',48,96,0), g=APH.Construction.record('bl_gate',96,96,0), wire=APH.Construction.record('bl_conduit',144,48,0);
  APH.state={colony:{scene:{width:480,height:480,grid:48},buildings:[f,w,g,wire]}};
  APH.Ent.drawWalls(0);
  if(!c.calls.some(function(x){return x[0]==='rect'&&x[1]===48&&x[2]===96;})) throw new Error('新墙必须按gx/gy共享格绘制');
  if(!c.calls.some(function(x){return x[0]==='fillRect'&&x[1]===49&&x[2]===49;})) throw new Error('新地板必须在独立格层可见');
});
