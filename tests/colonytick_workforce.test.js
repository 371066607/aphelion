const Tick=APH.ColonyTick;

function modernState(building, resident, entity){
  return {
    colony:{ rulesVersion:1, scene:{width:6144,height:6144,grid:48}, buildings:[building] },
    entities: entity ? [entity] : []
  };
}

test('colonyTick modern 工位必须有真实在场的活居民', function(){
  const b=APH.Construction.record('bl_lab', 1200, 1200, 0);
  const r={id:'worker',job:'bl_lab'}, s=modernState(b,r,null);
  if(Tick.takeWorkerAt(s,b,'bl_lab',{bl_lab:[r]})!==null || b.workReason!=='缺少在场工人')
    throw new Error('缺实体仍在隔空产出');

  const probe={x:b.x,y:b.y}, spot=APH.Construction.spot(s,b,probe);
  if(!spot) throw new Error('测试工位没有合法互动格');
  const e={id:'worker',rid:'worker',type:APH.CFG.entType.RESIDENT,x:spot.x,y:spot.y};
  s.entities=[e];
  const pool={bl_lab:[r]};
  if(Tick.takeWorkerAt(s,b,'bl_lab',pool)!==r || pool.bl_lab.length!==0 || b.workReason!==null)
    throw new Error('到合法工位的居民未被分配');
  if(!e.workFacilityUid) throw new Error('实体没有绑定本跳工位');
});

test('colonyTick modern 同一居民一跳只绑定一个设施', function(){
  const a={id:'bl_farm',x:1000,y:1000}, b={id:'bl_farm',x:1100,y:1000};
  const r={id:'farmer',job:'bl_farm'}, e={id:'farmer',rid:'farmer',type:APH.CFG.entType.RESIDENT,x:1000,y:1022};
  const s=modernState(a,r,e), pool={bl_farm:[r]}, bound={};
  if(Tick.takeWorkerAt(s,a,'bl_farm',pool,bound)!==r) throw new Error('第一设施未分配');
  if(Tick.takeWorkerAt(s,b,'bl_farm',pool,bound)!==null) throw new Error('同一居民被重复用于第二设施');
});

test('colonyTick modern 征召、睡眠、倒地和远离工位者不算工人', function(){
  const b={id:'bl_workshop',x:1000,y:1000};
  [ {dead:true}, {drafted:true}, {isSleeping:true}, {downed:true}, {x:1500,y:1500} ].forEach(function(over){
    const r=Object.assign({id:'w',job:'bl_workshop'},over);
    const e=Object.assign({id:'w',rid:'w',type:APH.CFG.entType.RESIDENT,x:1000,y:1022},over);
    const s=modernState(b,r,e), got=Tick.takeWorkerAt(s,b,'bl_workshop',{bl_workshop:[r]});
    if(got) throw new Error('不可工作的居民被计入产出: '+JSON.stringify(over));
  });
});

test('colonyTick modern 把断电与入口堵塞记到建筑', function(){
  const r={id:'w',job:'bl_kitchen'}, e={id:'w',rid:'w',type:APH.CFG.entType.RESIDENT,x:1000,y:1022};
  const off={id:'bl_kitchen',x:1000,y:1000,powered:false}, s=modernState(off,r,e);
  if(Tick.takeWorkerAt(s,off,'bl_kitchen',{bl_kitchen:[r]}) || off.workReason!=='断电') throw new Error('断电原因没记录');
  const b={id:'bl_kitchen',x:1000,y:1000}, prior=APH.Construction.spot;
  try{
    APH.Construction.spot=function(){ return null; };
    if(Tick.takeWorkerAt(s,b,'bl_kitchen',{bl_kitchen:[r]}) || b.workReason!=='入口堵塞') throw new Error('入口堵塞原因没记录');
  }finally{ APH.Construction.spot=prior; }
});

test('colonyTick 新家园低技能居民可修建筑, 旧档仍要技能3', function(){
  const low={id:'low',job:null,skills:{sk_build:1}};
  const busy={id:'farm',job:'bl_farm',skills:{sk_build:1}};
  const banned={id:'off',job:null,skills:{sk_build:1}};
  const legacyLow={id:'old',job:null,skills:{sk_build:1}};
  const legacyPro={id:'pro',job:null,skills:{sk_build:3}};
  const modern={colony:{rulesVersion:1},meta:{workPrio:{off:{sk_build:0}}}};
  if(!Tick.isRepairCrew(low, modern)) throw new Error('新家园技能1应能修');
  if(Tick.isRepairCrew(busy, modern)) throw new Error('占其他岗的人不应自动修');
  if(Tick.isRepairCrew(banned, modern)) throw new Error('建造优先级关闭后不应修');
  if(Tick.isRepairCrew(legacyLow, {colony:{}})) throw new Error('旧档技能1不应修');
  if(!Tick.isRepairCrew(legacyPro, {colony:{rulesVersion:0}})) throw new Error('旧档技能3应能修');
});

test('colonyTick 仅 rulesVersion===1 启用在场工位约束', function(){
  if(!Tick.modernWorkRules({colony:{rulesVersion:1}})) throw new Error('v1 没启用规则');
  if(Tick.modernWorkRules({colony:{rulesVersion:2}}) || Tick.modernWorkRules({colony:{}})) throw new Error('legacy 被误限产');
});

test('colonyTick 新家园按 TerrainModel 肥力推进农田，旧地图倍率保持 1', function(){
  const g=APH.TerrainModel.GRID, shore={id:'bl_farm',x:10*g+g/2,y:50*g+g/2};
  const ridge={id:'bl_farm',x:90*g+g/2,y:10*g+g/2};
  const modern={colony:{scene:APH.TerrainModel.home(42)}};
  if(Tick.terrainFertilityMul(modern,shore)<=1 || Tick.terrainFertilityMul(modern,ridge)>=1)
    throw new Error('新地图湖岸/矿丘肥力没有传给农田');
  if(Tick.farmGrowthMul(modern,shore,1,1,1,1)<=1 || Tick.farmGrowthMul(modern,ridge,1,1,1,1)>=1)
    throw new Error('农田生长乘子没有真正乘入地形肥力');
  if(Tick.terrainFertilityMul({colony:{scene:APH.TerrainModel.legacy(42)}},shore)!==1)
    throw new Error('旧地图农田肥力被改动');
});

test('colonyTick home context 只结算 home 居民，不改远征名册', function(){
  const home={id:'home-r',name:'留守',worldId:'home',food:80,mood:80,rest:80,recreation:80,skills:{}};
  const away={id:'away-r',name:'远征',worldId:'run-42',job:'bl_lab',food:80,mood:80,rest:80,recreation:80,skills:{}};
  const s={
    id:'home', scene:'home', mode:'running', seed:17, clock:0, px:1100, py:1100,
    meta:{residents:[home,away],res:{},stats:{},tech:{},bonds:{}}, spec:{laws:[]}, war:{}, parts:[],
    colony:{rulesVersion:0,scene:APH.TerrainModel.legacy(17),buildings:[],buildQueue:[],fires:[]},
    entities:[{id:'home-r',rid:'home-r',type:APH.CFG.entType.RESIDENT,x:1100,y:1100}]
  };
  const homeFood=home.food, awayFood=away.food, awayJob=away.job;
  Tick.run(s);
  if(home.food!==homeFood-APH.CFG.residents.foodDrain) throw new Error('留守居民需求没有恰好推进一跳');
  if(away.food!==awayFood || away.job!==awayJob || s.meta.residents.length!==2)
    throw new Error('远征居民被家园 tick 结算、改岗或从 canonical 名册丢失');
});

test('colonyTick home 工位不接纳远征 worldId 的居民或实体', function(){
  const b={id:'bl_lab',x:1000,y:1000};
  const r={id:'away',worldId:'run-42',job:'bl_lab'};
  const e={id:'away',rid:'away',worldId:'run-42',type:APH.CFG.entType.RESIDENT,x:1000,y:1022};
  const s={id:'home',scene:'home',colony:{buildings:[b]},entities:[e]};
  if(Tick.takeWorkerAt(s,b,'bl_lab',{bl_lab:[r]})) throw new Error('远征居民被家园工位借来隔空产出');
});

test('colonyTick 覆灭判定保留远征幸存者', function(){
  const s={id:'home',scene:'home',mode:'running',meta:{colonyFounded:true,residents:[{id:'away',worldId:'run-42'}]},
    colony:{buildings:[]},entities:[]};
  if(Tick.checkFall(s)) throw new Error('远征幸存者存在时家园不应提前结局');
});

test('colonyTick 刺激性异星植物在晴天也产生局部暴露，防护服减免',function(){
  const old=APH.state;
  function run(gear){
    const r=APH.Res.generate('alien_worker',88,[]);r.food=100;r.rest=100;r.recreation=100;r.exposure=0;r.gear=gear||{};
    const s={id:'home',scene:'home',mode:'running',seed:88,clock:0,px:1100,py:1100,parts:[],war:{},
      meta:{residents:[r],res:{},tech:{},stats:{},bonds:{}},spec:{laws:[]},
      colony:{rulesVersion:1,scene:APH.TerrainModel.home(88),buildings:[],buildQueue:[],fires:[]},
      entities:[{id:r.id,rid:r.id,type:APH.CFG.entType.RESIDENT,x:600,y:600},
        {id:'alien_bush',type:APH.CFG.entType.FLORA,x:630,y:600,exposureRisk:true,hp:30}]};
    APH.state=s;APH.ColonyTick.run(s);return r.exposure;
  }
  try{
    const bare=run(),protectedValue=run({suit:'it_suit_hazard'});
    if(!(bare>0&&protectedValue<bare))throw new Error('局部风险没进入生产跳或防护服不生效 '+bare+'/'+protectedValue);
  }finally{APH.state=old;}
});
