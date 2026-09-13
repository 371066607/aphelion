/* TerrainModel 的移动代价必须只影响 generation=1 家园；寻路和步进共享同一张 cost grid。 */
'use strict';
if(!window.APH.TerrainModel) require('../src/terrain_model.js');
const TM=window.APH.TerrainModel;
const Nav=window.APH.Nav;
const Res=window.APH.Res;

function moved(e, before){ return Math.hypot(e.x-before.x,e.y-before.y); }

test('terrain movement: 现代地图把湖岸与岩丘代价写入导航缓存，旧档保持普通速度', function(){
  const scene=TM.home(42), g=scene.grid;
  const grid=Nav.gridOf([],scene);
  const shore={x:10.5*g,y:50.5*g};
  const ridge={x:90.5*g,y:10.5*g};
  if(TM.cellAt(scene,shore.x,shore.y).region!=='lakeshore' || TM.cellAt(scene,ridge.x,ridge.y).region!=='ridge')
    throw new Error('fixture 未落在目标地形');
  const shoreCost=TM.cellAt(scene,shore.x,shore.y).moveCost;
  const ridgeCost=TM.cellAt(scene,ridge.x,ridge.y).moveCost;
  if(grid.costs[Math.floor(shore.y/g)][Math.floor(shore.x/g)]!==shoreCost || grid.costs[Math.floor(ridge.y/g)][Math.floor(ridge.x/g)]!==ridgeCost)
    throw new Error('TerrainModel moveCost 未进入导航缓存');

  const shoreWalker={x:shore.x-100,y:shore.y}, shoreBefore={x:shore.x-100,y:shore.y};
  Res.walkAround(shoreWalker,shore,1,48,grid);
  const ridgeWalker={x:ridge.x-100,y:ridge.y}, ridgeBefore={x:ridge.x-100,y:ridge.y};
  Res.walkAround(ridgeWalker,ridge,1,48,grid);
  if(Math.abs(moved(shoreWalker,shoreBefore)-48/shoreCost)>0.01) throw new Error('湖岸速度没有按一次 moveCost 缩放');
  if(Math.abs(moved(ridgeWalker,ridgeBefore)-48/ridgeCost)>0.01) throw new Error('岩丘速度没有按一次 moveCost 缩放');

  const legacy=TM.legacy(42), legacyGrid=Nav.gridOf([],legacy);
  const old={x:100,y:100}, oldBefore={x:100,y:100};
  Res.walkAround(old,{x:300,y:100},1,48,legacyGrid);
  if(Math.abs(moved(old,oldBefore)-48)>0.01 || legacyGrid.costs) throw new Error('generation=0 移动速度或缓存被改坏');
});

test('terrain movement: A* 为低总代价绕开高代价地带，普通旧网格仍直线', function(){
  const grid=[
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,0,0,0,0]
  ];
  grid.costs=[
    [1,1,1,1,1],
    [1,2,2,2,1],
    [1,1,1,1,1]
  ];
  grid.revision='terrain-route'; grid.costedAny=true;
  const from={x:24,y:72}, to={x:216,y:72};
  const path=Nav.astar(grid,from,to,null,{width:240,height:144,grid:48});
  if(!path || !path.some(function(p){return Math.floor(p.y/48)!==1;}))
    throw new Error('A* 没有避开更高总代价的中线');
  const legacy=[ [0,0,0,0,0], [0,0,0,0,0], [0,0,0,0,0] ];
  const direct=Nav.astar(legacy,from,to,null,{width:240,height:144,grid:48,generation:0});
  if(!direct || direct.length!==1 || direct[0].x!==to.x || direct[0].y!==to.y)
    throw new Error('旧网格不应因地形代价失去直线寻路');
});
