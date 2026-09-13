const Observe = window.APH.Observe;

test('#198 Observation 相同输入产生相同的复合格网', function(){
  if(!Observe || typeof Observe.observe !== 'function') throw new Error('缺少 APH.Observe.observe 公共入口');
  const opts={seed:77,biomeId:'biome_landing',widthCells:32,heightCells:24,allowWater:true};
  const a=Observe.observe(opts),b=Observe.observe(opts);
  if(a.v!==1||a.widthCells!==32||a.heightCells!==24) throw new Error('Observation 尺寸或版本不符合契约');
  if(!Array.isArray(a.ground)||a.ground.length!==32*24) throw new Error('ground 不是稳定的行优先格网');
  if(!Array.isArray(a.resources)) throw new Error('Observation 缺少独立自然资源层');
  if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error('相同 seed、群系和尺寸没有得到相同 Observation');
});

test('#198 家园核心地面与首夜资源是同一次观测的两个层', function(){
  if(!Observe || typeof Observe.observe !== 'function') throw new Error('缺少 APH.Observe.observe 公共入口');
  const o=Observe.observe({seed:9301,biomeId:'biome_landing',widthCells:128,heightCells:128,home:true});
  for(let gy=13;gy<=32;gy++) for(let gx=13;gx<=32;gx++){
    if(o.ground[gy*o.widthCells+gx]!=='landing') throw new Error('20×20 核心地面被覆盖于 '+gx+','+gy);
  }
  const starter=o.resources.filter(r=>r.starter);
  const wood=starter.filter(r=>r.kind==='tree');
  const stone=starter.filter(r=>r.kind==='rock_stone');
  if(wood.length!==24||stone.length!==18) throw new Error('首夜资源环数量错误 wood='+wood.length+' stone='+stone.length);
  const occupied=new Set();
  starter.forEach(function(r){
    const key=r.gx+','+r.gy;
    if(occupied.has(key)) throw new Error('两份资源占用了同一格 '+key);
    occupied.add(key);
    const x=(r.gx+.5)*APH.CFG.GRID,y=(r.gy+.5)*APH.CFG.GRID;
    const dist=Math.hypot(x-APH.CFG.HAB.x,y-APH.CFG.HAB.y);
    if(dist<300||dist>500) throw new Error('首夜资源不在 300–500px 环内 '+key+' d='+dist);
    if(o.ground[r.gy*o.widthCells+r.gx]!=='landing') throw new Error('资源占用物改写了核心 Ground Tile '+key);
  });
});

test('#198 正常观测不降级且 seed 会改变实际地形', function(){
  const a=Observe.observe({seed:7,biomeId:'biome_landing',widthCells:40,heightCells:40,allowWater:true});
  const b=Observe.observe({seed:8,biomeId:'biome_landing',widthCells:40,heightCells:40,allowWater:true});
  if(a.degraded||b.degraded) throw new Error('正常默认输入不应进入 degraded');
  if(new Set(a.ground).size<3||new Set(b.ground).size<3) throw new Error('正常观测没有形成实际地形差异');
  if(JSON.stringify(a.ground)===JSON.stringify(b.ground)) throw new Error('不同 seed 得到了同一张地面');
});

test('#198 零水体观测不会留下水或干湖岸', function(){
  const o=Observe.observe({seed:12,biomeId:'biome_landing',widthCells:48,heightCells:48,allowWater:false});
  if(typeof Observe.hasWater!=='function'||Observe.hasWater(o)) throw new Error('零水体 Observation 仍报告有水');
  if(o.ground.some(t=>t==='water'||t==='lakeshore')) throw new Error('零水体 Observation 留下了水或干湖岸');
  if(typeof Observe.cellAt!=='function') throw new Error('缺少公开格子查询');
  const c=Observe.cellAt(o,0,0);
  if(!c||c.water||!c.walkable) throw new Error('零水体普通地面语义错误');
  const naturallyDry=Observe.observe({seed:2,biomeId:'biome_landing',widthCells:1,heightCells:1,allowWater:true});
  if(Observe.hasWater(naturallyDry)||naturallyDry.ground[0]==='lakeshore')
    throw new Error('自然生成的无水地图留下了干湖岸');
  const pinnedDry=Observe.observe({seed:2,biomeId:'biome_landing',widthCells:1,heightCells:1,
    allowWater:false,groundPins:[{gx:0,gy:0,tile:'lakeshore'}]});
  if(Observe.hasWater(pinnedDry)||pinnedDry.ground[0]==='lakeshore')
    throw new Error('无水地图仍保留被 pin 的干湖岸');
});

test('#198 资源 pin 按格去重、限制边界并服从群系地面兼容表', function(){
  const o=Observe.observe({
    seed:18,biomeId:'biome_landing',widthCells:2,heightCells:1,
    groundPins:[{gx:0,gy:0,tile:'landing'},{gx:1,gy:0,tile:'water'}],
    resourcePins:[
      {gx:0,gy:0,kind:'rock_stone'},
      {gx:0,gy:0,kind:'tree',yieldItemId:'it_ancient_core',amount:999},
      {gx:1,gy:0,kind:'tree'},
      {gx:2,gy:0,kind:'tree'},
      {gx:0,gy:0,kind:'unknown_flora'}
    ]
  });
  if(o.resources.length!==1) throw new Error('资源没有按有效观测格收口 '+JSON.stringify(o.resources));
  const r=o.resources[0];
  if(r.gx!==0||r.gy!==0||r.kind!=='tree') throw new Error('同格资源没有稳定地采用最后一个有效 pin');
  if(r.yieldItemId!=='it_wood'||r.amount!==4) throw new Error('资源没有携带配置表中的产物语义');
  if(!APH.CFG.observe.biomes.biome_landing.resourceGround.tree.includes('landing'))
    throw new Error('群系砖表没有声明资源—地面兼容关系');
});

test('#198 ground pin 与 fallback 不能写入群系表外的地面', function(){
  let calls=0;
  const o=Observe.observe({
    seed:19,biomeId:'biome_landing',widthCells:2,heightCells:1,
    groundPins:[{gx:0,gy:0,tile:'not_a_ground'}],
    fallback:function(){calls++;return {ground:['not_a_ground','woodland']};}
  });
  const allowed=new Set(APH.CFG.observe.biomes.biome_landing.tiles.map(t=>t.id));
  if(!o.degraded||calls!==1) throw new Error('非法 Ground pin 没有进入一次确定性降级');
  if(o.ground.some(tile=>!allowed.has(tile))) throw new Error('群系表外地面进入 Observation '+JSON.stringify(o.ground));
});

test('#198 未知群系不会被静默改写或污染 CFG', function(){
  const before=JSON.stringify(APH.CFG.observe.biomes);
  const o=Observe.observe({seed:1,biomeId:'biome_unknown',widthCells:2,heightCells:2});
  if(o.biomeId!=='biome_unknown') throw new Error('未知群系被改写成 '+o.biomeId);
  if(!o.degraded) throw new Error('缺少砖表的群系没有显式进入降级路径');
  if(JSON.stringify(APH.CFG.observe.biomes)!==before) throw new Error('Observe 改写了全局 CFG');
});

test('#198 地面邻接矛盾会有限降级且仍可复现', function(){
  const allowed=Observe.observe({
    seed:99,biomeId:'biome_landing',widthCells:2,heightCells:1,
    groundPins:[{gx:0,gy:0,tile:'lakeshore'},{gx:1,gy:0,tile:'water'}]
  });
  if(allowed.degraded) throw new Error('合法的湖岸—水相邻被误判为失败');
  const opts={
    seed:99,biomeId:'biome_landing',widthCells:2,heightCells:1,
    groundPins:[{gx:0,gy:0,tile:'landing'},{gx:1,gy:0,tile:'water'}]
  };
  const a=Observe.observe(opts),b=Observe.observe(opts);
  if(!a.degraded) throw new Error('水直接贴 landing 应进入 degraded');
  if(a.ground[0]!=='landing'||a.ground[1]!=='water') throw new Error('降级没有保留明确 Ground pins');
  if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error('降级结果不可复现');
});

test('#198 四种远征 biome 产生地图并执行不同邻接规则', function(){
  const biomes=['biome_spore_forest','biome_crystal_wasteland','biome_acid_marsh','biome_cryo_tundra'];
  biomes.forEach(function(biomeId){
    const a=Observe.observe({seed:42,biomeId:biomeId,widthCells:24,heightCells:24});
    const b=Observe.observe({seed:43,biomeId:biomeId,widthCells:24,heightCells:24});
    if(a.degraded||b.degraded) throw new Error(biomeId+' 正常观测降级');
    if(new Set(a.ground).size<2) throw new Error(biomeId+' 没有形成群系内部地形');
    if(JSON.stringify(a.ground)===JSON.stringify(b.ground)) throw new Error(biomeId+' 不受 seed 影响');
  });
  function pair(biomeId,left,right){
    return Observe.observe({seed:5,biomeId:biomeId,widthCells:2,heightCells:1,
      groundPins:[{gx:0,gy:0,tile:left},{gx:1,gy:0,tile:right}]}).degraded;
  }
  if(pair('biome_spore_forest','spore_water','spore_water')) throw new Error('菌林水团不能相连');
  if(!pair('biome_spore_forest','spore_water','spore_grove')) throw new Error('菌林水直接贴密林却未被拒绝');
  if(!pair('biome_crystal_wasteland','crystal_water','crystal_water')) throw new Error('晶蚀水坑应保持离散');
  if(pair('biome_crystal_wasteland','crystal_water','spire')) throw new Error('晶蚀水坑不能贴晶脊');
  if(!pair('biome_acid_marsh','acid_pool','peat')) throw new Error('酸池绕过 bog 直接贴泥炭');
  if(pair('biome_acid_marsh','acid_pool','bog')) throw new Error('酸池不能贴沼地');
  if(pair('biome_cryo_tundra','pack_ice','permafrost')) throw new Error('雪原浮冰不能贴永久冻土');
});

test('#198 求解失败可注入现有生成器作为确定性 fallback', function(){
  let calls=0;
  const result=Observe.observe({
    seed:61,biomeId:'biome_landing',widthCells:2,heightCells:1,
    groundPins:[{gx:0,gy:0,tile:'landing'},{gx:1,gy:0,tile:'water'}],
    fallback:function(ctx){
      calls++;
      if(ctx.seed!==61||ctx.widthCells!==2||ctx.heightCells!==1) throw new Error('fallback 没拿到完整观测上下文');
      return {ground:['woodland','woodland'],resources:[{gx:0,gy:0,kind:'tree'}]};
    }
  });
  if(calls!==1||!result.degraded) throw new Error('求解失败没有只调用一次 fallback');
  if(result.ground[0]!=='landing'||result.ground[1]!=='water') throw new Error('fallback 覆盖了明确 Ground pins');
  if(result.resources.length!==1||result.resources[0].kind!=='tree') throw new Error('fallback 自然资源没有进入 Observation');
});
