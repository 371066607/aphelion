/* #200 家园所有消费者必须读取同一份 Observation/TerrainModel。 */
'use strict';
const assert=require('assert');
const TM=window.APH.TerrainModel;
const Nav=window.APH.Nav;
const Ent=window.APH.Ent;
const Ecology=window.APH.Ecology;
const Colony=window.APH.Colony;
const Camera=window.APH.Camera;
const Scene=window.APH.Scene;
const Res=window.APH.Res;
const CFG=window.APH.CFG;

function observedScene(){
  return {
    v:1,kind:'home',generation:1,seed:200,grid:48,width:999,height:999,
    observation:{
      v:1,widthCells:4,heightCells:3,biomeId:'biome_landing',degraded:false,
      ground:[
        'landing','woodland','ridge','lakeshore',
        'landing','water','ridge','lakeshore',
        'wreckage','alien','woodland','landing'
      ],
      resources:[{gx:0,gy:2,kind:'rock_wreckage',uid:'observed_only',yieldItemId:'it_alloy',amount:2}]
    }
  };
}

test('#200 single source: Observation 尺寸、格语义、导航和生态使用同一坐标定义',function(){
  const scene=observedScene(),dims=TM.dimensions(scene),grid=Nav.gridOf([],scene);
  assert.deepEqual(dims,{grid:48,width:192,height:144,cols:4,rows:3});
  assert.equal(grid.length,dims.rows);
  assert.equal(grid[0].length,dims.cols);
  for(let gy=0;gy<dims.rows;gy++)for(let gx=0;gx<dims.cols;gx++){
    const x=(gx+.5)*dims.grid,y=(gy+.5)*dims.grid,c=TM.cellAt(scene,x,y);
    assert.equal(grid[gy][gx],c.walkable?0:1,'通行性分歧 '+gx+','+gy);
    assert.equal(grid.costs[gy][gx],c.moveCost,'移动代价分歧 '+gx+','+gy);
  }
  assert.equal(Nav.astar(grid,{x:24,y:24},{x:999,y:999},null,scene),null,
    'observed A* 不得把越界原始目标追加回路径');
  const woodland={x:72,y:24},ridge={x:120,y:24},water={x:72,y:72};
  assert.equal(Ecology.habitatAt(scene,woodland.x,woodland.y),'grazer');
  assert.equal(Ecology.habitatAt(scene,ridge.x,ridge.y),'ridge_guard');
  assert.equal(Ecology.habitatAt(scene,water.x,water.y),null);
  const expectedFertility=TM.fertilityMultiplier(scene,ridge.x,ridge.y);
  assert.equal(expectedFertility,CFG.observe.tileSemantics.ridge.fertility/.5);
  const zone=Colony.addGrowZone([],[ridge],null,scene).zone;
  assert.equal(zone.cells[0].fertility,expectedFertility,'正式种植区未读取 TerrainModel 肥力');
});

test('#200 boundaries: 旧二维 Observation、相机和建筑格都服从观测尺寸',function(){
  const prior={v:1,kind:'home',generation:1,seed:201,grid:48,width:999,height:999,
    observation:{grid:[['landing','water']],degraded:false,biomeId:'biome_landing'}};
  assert.deepEqual(TM.dimensions(prior),{grid:48,width:96,height:48,cols:2,rows:1},
    '旧二维 Observation 没有用自身格数恢复尺寸');

  const scene=observedScene();
  assert.equal(Scene.width({scene:'home',colony:{scene:scene}}),192,'Scene.width 仍读取旧包络');
  assert.equal(Scene.height({scene:'home',colony:{scene:scene}}),144,'Scene.height 仍读取旧包络');
  const cameraState={scene:'home',camX:190,camY:130,camZoom:1,colony:{scene:scene}};
  Camera.clamp(cameraState,{w:96,h:96});
  assert.deepEqual({x:cameraState.camX,y:cameraState.camY},{x:144,y:96},
    '相机仍按外层旧包络越出 Observation');

  const legacy=TM.legacy(201);
  legacy.observation={v:1,widthCells:2,heightCells:2,biomeId:'biome_landing',degraded:false,
    ground:['landing','landing','landing','landing'],resources:[]};
  const legacyCamera={scene:'home',camX:2190,camY:2190,camZoom:1,colony:{scene:legacy}};
  Camera.clamp(legacyCamera,{w:96,h:96});
  assert.deepEqual({x:legacyCamera.camX,y:legacyCamera.camY},{x:2152,y:2152},
    'generation 0 相机错误采用了残留 Observation 边界');

  const narrowEnvelope=observedScene();
  narrowEnvelope.width=narrowEnvelope.height=48;
  const wall={id:'bl_wall',geometryVersion:1,gx:2,gy:1};
  const nav=Nav.gridOf([wall],narrowEnvelope);
  assert.equal(nav[1][2],1,'Observation 内的合法建筑被外层旧包络丢弃');
});

test('#200 activity: 全陆地越界目标与直移水格都不能绕过 observed 导航',function(){
  const land=observedScene();
  land.observation.ground=new Array(4*3).fill('landing');
  const landGrid=Nav.gridOf([],land),resident={x:152,y:104,walking:false};
  Res.walkAround(resident,{x:500,y:104},1,400,landGrid);
  assert.equal(resident.x,152,'全陆地快路径把居民带出 Observation');
  assert.equal(resident.y,104,'越界目标不应改变居民坐标');

  const wet={v:1,kind:'home',generation:1,seed:204,grid:48,width:96,height:96,
    observation:{v:1,widthCells:2,heightCells:2,biomeId:'biome_landing',degraded:false,
      ground:['landing','water','landing','landing'],resources:[]}};
  const wetGrid=Nav.gridOf([],wet),wanderer={type:'resident',x:47,y:40,wanderT:1,wanderA:0};
  Res.wanderStep(wanderer,1,{x:47,y:40},70,function(){return 0;},9,wetGrid);
  assert.equal(TM.cellAt(wet,wanderer.x,wanderer.y).walkable,true,
    '精神崩溃/家畜游荡可直接进入 Observation 水格');
});

test('#200 player: observed 水格阻挡且边界来自 Observation，generation 0 保留旧圆湖',function(){
  const scene=observedScene();
  let s={scene:'home',colony:{scene},px:24,py:72,spec:{terrain:{lakeR:90}}};
  assert.deepEqual(Ent.resolveTerrainMove(s,72,72),{x:24,y:72});
  assert.deepEqual(Ent.resolveTerrainMove(s,999,999),{x:152,y:104});

  const dry=observedScene(),dryCells=48;
  dry.width=dry.height=dryCells*48;
  dry.observation.widthCells=dry.observation.heightCells=dryCells;
  dry.observation.ground=new Array(dryCells*dryCells).fill('landing');
  dry.observation.resources=[];
  s={scene:'home',colony:{scene:dry},px:CFG.LAKE.x-CFG.LAKE.r,py:CFG.LAKE.y,
    spec:{terrain:{lakeR:CFG.LAKE.r}}};
  assert.deepEqual(Ent.resolveTerrainMove(s,CFG.LAKE.x,CFG.LAKE.y),{x:CFG.LAKE.x,y:CFG.LAKE.y},
    '零水 Observation 的旧湖中心仍有隐形碰撞');

  s={scene:'home',colony:{scene:TM.legacy(200)},px:CFG.LAKE.x-CFG.LAKE.r,py:CFG.LAKE.y,
    spec:{terrain:{lakeR:CFG.LAKE.r}}};
  const legacy=Ent.resolveTerrainMove(s,CFG.LAKE.x,CFG.LAKE.y);
  assert.notEqual(legacy.x,CFG.LAKE.x,'generation 0 旧湖碰撞被移除');
});

test('#200 resources: observed 家园只实体化 Observation 资源，不叠加程序化 rock/crystal',function(){
  const prior=APH.state,scene=TM.newHome(200);
  try{
    APH.state={scene:'home',seed:200,meta:{},colony:{scene:scene,buildings:[],buildQueue:[],ground:[],
      depleted:{},floraState:{},floraRespawn:[]},entities:[],parts:[]};
    const expected=TM.resources(scene,{}).map(function(e){return e.uid;}).sort();
    Colony.buildColonyWorld(200);
    const actual=APH.state.entities.filter(function(e){return e.type===CFG.entType.FLORA;})
      .map(function(e){return e.id;}).sort();
    assert.deepEqual(actual,expected);
    assert.equal(APH.state.entities.some(function(e){return e.type===CFG.entType.ROCK||e.type===CFG.entType.CRYSTAL;}),false);
  }finally{APH.state=prior;}
});

test('#200 cache revision: 替换同 seed 同尺寸 Observation 会产生新地形修订号',function(){
  const a=observedScene(),b=observedScene();
  b.observation.ground=b.observation.ground.slice();b.observation.ground[0]='water';
  assert.notEqual(TM.revision(a),TM.revision(b));
  assert.equal(TM.revision(a),TM.revision(a));
  const unobserved={v:1,kind:'fixture',generation:1,seed:200,grid:48,width:240,height:144};
  const grid=Nav.gridOf([],unobserved);
  assert.equal(grid.length,3,'未观测显式场景高度不得被 normalize 成旧世界');
  assert.equal(grid[0].length,5,'未观测显式场景宽度不得被 normalize 成旧世界');
});
