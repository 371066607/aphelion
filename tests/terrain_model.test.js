/* TerrainModel 必须可在没有 DOM/存档的测试进程中独立推导。 */
if(!window.APH.TerrainModel) require('../src/terrain_model.js');
const TerrainModel = window.APH.TerrainModel;
const Nav = window.APH.Nav;

test('TerrainModel 新家园是固定的 128×128 格描述', function(){
  const s=TerrainModel.home(42);
  if(s.v!==1 || s.width!==6144 || s.height!==6144 || s.grid!==48 || s.seed!==42 || s.kind!=='home' || s.generation!==1)
    throw new Error('新家园描述不符合契约');
});

test('TerrainModel 旧场景保持 2200 与 generation 0', function(){
  const s=TerrainModel.legacy(42);
  if(s.width!==2200 || s.height!==2200 || s.generation!==0) throw new Error('旧档尺寸被改坏');
  const c=TerrainModel.cellAt(s, 1100, 1100);
  if(!c.walkable || !c.buildable || c.region!=='legacy') throw new Error('旧档格子不兼容');
});

test('TerrainModel 湖岸沃土与贫瘠矿丘导出可用于作物的倍率', function(){
  const s=TerrainModel.home(42), g=s.grid;
  /* 湖中心在 x≈84 格，取远离湖面的同一 lakeshore 带；矿丘取 ridge。 */
  const shore=TerrainModel.fertilityMultiplier(s,10*g+g/2,50*g+g/2);
  const ridge=TerrainModel.fertilityMultiplier(s,90*g+g/2,10*g+g/2);
  if(TerrainModel.cellAt(s,10*g+g/2,50*g+g/2).region!=='lakeshore' || shore<=1)
    throw new Error('湖岸没有成为高于普通土的肥地');
  if(TerrainModel.cellAt(s,90*g+g/2,10*g+g/2).region!=='ridge' || ridge>=1)
    throw new Error('矿丘没有成为低于普通土的贫地');
  if(TerrainModel.fertilityMultiplier(TerrainModel.legacy(42),1100,1100)!==1)
    throw new Error('旧地图土壤倍率不应改变');
});

test('TerrainModel 两块 20×20 建地连续并可建造', function(){
  const s=TerrainModel.home(9), g=s.grid;
  const a=TerrainModel.cellAt(s, 19*g+1, 10*g+1), b=TerrainModel.cellAt(s, 20*g+1, 10*g+1);
  const c=TerrainModel.cellAt(s, 32*g+1, 22*g+1), d=TerrainModel.cellAt(s, 33*g+1, 22*g+1);
  if(!c.buildable || !d.buildable || c.region!=='landing' || d.region!=='woodland') throw new Error('旧 HAB 旁两块建地不连续');
});

test('TerrainModel seed 会改变区域分界，出生锚点仍留在旧 HAB', function(){
  const g=TerrainModel.GRID;
  if(TerrainModel.cellAt(TerrainModel.home(0),76*g,g).region===TerrainModel.cellAt(TerrainModel.home(6),76*g,g).region)
    throw new Error('seed 没有影响区域布局');
  const a=TerrainModel.landmarks(TerrainModel.home(0)).hab;
  if(a.x!==1100 || a.y!==1100) throw new Error('新档出生锚点迁走了');
});

test('TerrainModel 资源清单确定、约两千对象、补给充足、矿物耗尽只留残骸', function(){
  const s=TerrainModel.home(77), a=TerrainModel.resources(s, {}), b=TerrainModel.resources(s, {});
  if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error('相同 seed 资源不稳定');
  const food=a.filter(function(x){ return x.kind==='bush_berry'; });
  const wood=a.filter(function(x){ return x.kind==='tree'; });
  const iron=a.find(function(x){ return x.kind==='rock_iron'; });
  const foodYield=food.reduce(function(n,x){ return n+x.amount; },0);
  const woodYield=wood.reduce(function(n,x){ return n+x.amount; },0);
  const starter=a.filter(function(x){ return x.starter; });
  const starterWood=starter.filter(function(x){ return x.kind==='tree'; }).reduce(function(n,x){ return n+x.amount; },0);
  const starterStone=starter.filter(function(x){ return x.kind==='rock_stone'; }).reduce(function(n,x){ return n+x.amount; },0);
  if(a.length<1800 || a.length>2300 || foodYield<36 || woodYield<80 || !iron) throw new Error('生态清单/开局补给或建材不足');
  if(starterWood<80 || starterStone<64 || starter.some(function(x){
    const dx=x.x-1100, dy=x.y-1100, d=Math.sqrt(dx*dx+dy*dy); return d<300 || d>500;
  })) throw new Error('首夜建材不在 HAB 300–500px 范围');
  const c=TerrainModel.cellAt(s, iron.x, iron.y);
  if(!c.walkable) throw new Error('重要矿物不可达');
  const spent=TerrainModel.resources(s, {[iron.uid]:true}).find(function(x){ return x.uid===iron.uid; });
  if(!spent.depleted || !spent.mineralRemains || spent.amount!==0 || spent.kind!==iron.kind) throw new Error('矿物耗尽后复生了');
  const allSpent=TerrainModel.resources(s, Object.fromEntries(a.filter(function(x){ return x.kind==='rock_iron'||x.kind==='rock_stone'; }).map(function(x){ return [x.uid,true]; })));
  if(allSpent.some(function(x){ return (x.kind==='rock_iron'||x.kind==='rock_stone') && (!x.depleted || x.amount!==0); })) throw new Error('石头或矿点没尊重 depleted');
});

test('TerrainModel 重要资源从 HAB 经真实水格 A* 可达', function(){
  const s=TerrainModel.home(77), lm=TerrainModel.landmarks(s), grid=[];
  for(let gy=0;gy<128;gy++){
    const row=[];
    for(let gx=0;gx<128;gx++) row.push(TerrainModel.cellAt(s,(gx+.5)*48,(gy+.5)*48).walkable?0:1);
    grid.push(row);
  }
  const critical=TerrainModel.resources(s,{}).filter(function(x){ return x.critical; });
  if(!critical.length) throw new Error('没有定义重要资源');
  critical.forEach(function(x){
    const path=Nav.astar(grid,lm.hab,{x:x.x,y:x.y},null,s);
    if(!path || path[path.length-1].x!==x.x || path[path.length-1].y!==x.y) throw new Error('HAB 无法抵达 '+x.uid);
  });
});

test('TerrainModel 新资源版本给出真实标本与有限可修复残骸，旧地图身份保持稳定',function(){
  const scene=TerrainModel.home(77),resources=TerrainModel.resources(scene,{});
  const samples=resources.filter(e=>e.kind==='bush_alien'),wrecks=resources.filter(e=>e.kind==='rock_wreckage');
  if(!samples.length||!wrecks.some(e=>e.repairable))throw new Error('区域缺少其专属资源');
  if(samples.some(e=>!APH.CFG.items[e.yieldItemId]||!e.seedItem||!e.exposureRisk))throw new Error('异星植物产出不是实际标本');
  const wreck=wrecks[0],spent=TerrainModel.resources(scene,{[wreck.uid]:true}).find(e=>e.uid===wreck.uid);
  if(!spent.depleted||spent.amount!==0||!spent.mineralRemains)throw new Error('残骸拆解后重生');
  const old=Object.assign({},scene);delete old.resourceVersion;
  if(TerrainModel.normalize(old).resourceVersion!==1||TerrainModel.resources(old,{}).some(e=>e.kind==='bush_alien'||e.kind==='rock_wreckage'))
    throw new Error('已有大图因升级偷换了采集物身份');
});

test('TerrainModel 六个固定 seed 的两块 20×20 建地、首夜物资与分区资源契约',function(){
  const seeds=[0,1,6,77,9301,0xffffffff],g=TerrainModel.GRID,regions=['landing','woodland','lakeshore','ridge','alien','wreckage'];
  function gridOf(scene){return Array.from({length:128},(_,gy)=>Array.from({length:128},(_,gx)=>TerrainModel.cellAt(scene,(gx+.5)*g,(gy+.5)*g).walkable?0:1));}
  function connected(scene,x0,x1){
    const seen=new Set(),todo=[[x0,13]],key=(x,y)=>x+','+y;
    while(todo.length){const [x,y]=todo.pop();if(x<x0||x>x1||y<13||y>32||seen.has(key(x,y)))continue;const c=TerrainModel.cellAt(scene,(x+.5)*g,(y+.5)*g);if(!c.buildable)continue;seen.add(key(x,y));todo.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
    return seen.size===400;
  }
  seeds.forEach(function(seed){
    const scene=TerrainModel.home(seed),resources=TerrainModel.resources(scene,{}),nav=gridOf(scene),hab=TerrainModel.landmarks(scene).hab;
    [[13,32,'landing'],[33,52,'woodland']].forEach(function(spec){
      for(let y=13;y<33;y++)for(let x=spec[0];x<=spec[1];x++){const c=TerrainModel.cellAt(scene,(x+.5)*g,(y+.5)*g);if(!c.buildable)throw new Error('seed '+seed+' '+spec[2]+' buildable 失败于 '+x+','+y);}
      if(!connected(scene,spec[0],spec[1]))throw new Error('seed '+seed+' '+spec[2]+' 400 格不连通');
    });
    const starter=resources.filter(r=>r.starter),food=resources.filter(r=>r.kind==='bush_berry'&&r.days===2&&r.forColonists===3).reduce((n,r)=>n+r.amount,0),wood=starter.filter(r=>r.kind==='tree').reduce((n,r)=>n+r.amount,0),stone=starter.filter(r=>r.kind==='rock_stone').reduce((n,r)=>n+r.amount,0);
    const twoDayFood=Math.ceil(3*APH.CFG.residents.foodDrain*(APH.CFG.DAY_LEN*2/APH.CFG.time.prodTick)/APH.CFG.residents.eatGain);
    if(food<twoDayFood||wood<80||stone<64)throw new Error('seed '+seed+' 开局实际 dropCount 不足 food='+food+'/'+twoDayFood+' wood='+wood+' stone='+stone);
    regions.forEach(function(region){
      const sample=resources.find(r=>TerrainModel.cellAt(scene,r.x,r.y).region===region);
      if(!sample)throw new Error('seed '+seed+' '+region+' 没有实际资源');
      const path=Nav.astar(nav,hab,{x:sample.x,y:sample.y},null,scene);
      if(!path)throw new Error('seed '+seed+' '+region+' 资源不可达 '+sample.uid);
    });
  });
});

test('TerrainModel 矿物与可修复残骸的采空状态跨 Save/WorldRuntime/重建保持',function(){
  const scene=TerrainModel.home(9301),all=TerrainModel.resources(scene,{}),mineral=all.find(r=>r.kind==='rock_iron'),wreck=all.find(r=>r.kind==='rock_wreckage'&&r.repairable);
  if(!mineral||!wreck)throw new Error('fixture 缺少矿或可修复残骸');
  const depleted={[mineral.uid]:true,[wreck.uid]:true},colony={v:2,scene:scene,depleted:depleted,buildings:[],buildQueue:[],ground:[]};
  APH.Save.saveColony(colony);const loaded=APH.Save.loadColony(),runtime=APH.WorldRuntime.serializable({scene:loaded.scene,entities:[]});
  const rebuilt=TerrainModel.resources(runtime.scene,loaded.depleted);
  [mineral.uid,wreck.uid].forEach(function(uid){const e=rebuilt.find(r=>r.uid===uid);if(!e||!e.depleted||e.amount!==0||!e.mineralRemains)throw new Error('快照/切图重建后采空复生 '+uid);});
});
