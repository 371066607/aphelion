/* ============================================================
   Aphelion · terrain_model.js — 家园地形规格与确定性资源模型
   纯数据层：不读 APH.state、不写存档、不创建实体或 canvas。
   ============================================================ */
window.APH = window.APH || {};

APH.TerrainModel = (function(){
  'use strict';

  var CFG = APH.CFG, U = APH.U;
  var GRID = CFG.GRID;
  var HOME_SIZE = (CFG.homeMap && CFG.homeMap.cells || 128) * GRID;
  var LEGACY_SIZE = CFG.WORLD;
  var HOME_GENERATION = 1, LEGACY_GENERATION = 0;

  /* 128×128 格的六个明确区域。landing 与 woodland 的前 20 格共享边界，
     是两块连续的保底建地；它们不是第七种“settlement”区域。 */
  var REGIONS = ['landing','woodland','lakeshore','ridge','alien','wreckage'].map(function(id){
    var semantics=CFG.observe.tileSemantics[id];
    return {id:id,fertility:semantics.fertility,moveCost:semantics.moveCost,color:semantics.color};
  });

  function n(v, fallback){ return typeof v==='number' && isFinite(v) ? v : fallback; }
  function u32(v){ return (v >>> 0); }
  function hash(seed, a, b){
    var h=u32(seed)^Math.imul(u32(a)+0x9e3779b9, 0x85ebca6b)^Math.imul(u32(b)+0xc2b2ae35, 0x27d4eb2f);
    h^=h>>>16; h=Math.imul(h,0x7feb352d); h^=h>>>15; h=Math.imul(h,0x846ca68b); h^=h>>>16;
    return u32(h);
  }
  function rand(seed, a, b){ return hash(seed,a,b)/4294967296; }
  function stringSalt(value){
    var h=2166136261,s=String(value||'');
    for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return u32(h);
  }
  function resolvedResourceRule(kind,variantId){
    var base=CFG.observe&&CFG.observe.resourceSemantics&&CFG.observe.resourceSemantics[kind];
    var variant=variantId&&base&&base.variants&&base.variants[variantId],out={},key;
    if(!base||(variantId&&!variant))return null;
    for(key in base)if(base.hasOwnProperty(key)&&key!=='variants')out[key]=base[key];
    if(variant)for(key in variant)if(variant.hasOwnProperty(key))out[key]=variant[key];
    return out;
  }
  function resourceRecord(seed,kind,gx,gy,extra,uid,variantId){
    var rule=resolvedResourceRule(kind,variantId),record,key,yieldItemId;
    if(!rule)return null;
    yieldItemId=rule.yieldItemId;
    if(Array.isArray(rule.yieldItemIds)&&rule.yieldItemIds.length)
      yieldItemId=rule.yieldItemIds[hash(seed,gx+(rule.yieldSalt||0),gy)%rule.yieldItemIds.length];
    record={
      uid:uid||('obs_'+u32(seed)+'_'+kind+'_'+gx+'_'+gy),gx:gx,gy:gy,kind:kind,
      visualKind:rule.visualKind||kind,yieldItemId:yieldItemId,amount:rule.amount,
      hp:rule.hp,depleted:false,seed:hash(seed^stringSalt(kind),gx,gy),
      renewable:rule.renewable===true,regenTicks:rule.renewable===true?(rule.regenTicks||1):0
    };
    if(rule.seedItemFromYield)record.seedItem=yieldItemId;
    else if(rule.seedItem)record.seedItem=rule.seedItem;
    if(rule.exposureRisk)record.exposureRisk=true;
    if(rule.mineral)record.mineral=true;
    if(extra)for(key in extra)if(extra.hasOwnProperty(key))record[key]=extra[key];
    return record;
  }
  function observationResourceUid(seed,kind,gx,gy){
    return 'obs_'+u32(seed)+'_'+kind+'_'+gx+'_'+gy;
  }
  function resourceError(record,strict,worldSeed,options){
    if(!record||typeof record!=='object')return 'invalid-resource';
    var rule=resolvedResourceRule(record.kind,record.variantId||record.variant);
    var item=Object.prototype.hasOwnProperty.call(record,'yieldItemId')?record.yieldItemId:(rule&&rule.yieldItemId);
    if(!rule)return 'unknown-resource-kind:'+String(record.kind||'');
    if(typeof item!=='string'||!CFG.items||!CFG.items[item])return 'invalid-resource-yield:'+String(item||'');
    if(record.amount!=null&&(!(record.amount>0)||!isFinite(record.amount)))return 'invalid-resource-amount';
    if(strict){
      options=options||{};
      var allowMissing=options.allowMissingDerived===true;
      var hasUid=Object.prototype.hasOwnProperty.call(record,'uid');
      if(!allowMissing&&!hasUid)return 'invalid-resource-uid';
      if(hasUid&&(typeof record.uid!=='string'||!record.uid))return 'invalid-resource-uid';
      if(record.gx!==(record.gx|0)||record.gy!==(record.gy|0))return 'invalid-resource-position';
      if(typeof worldSeed!=='number'||!isFinite(worldSeed)||worldSeed!==(worldSeed>>>0))return 'invalid-resource-world-seed';
      /* Observation 的自然资源会直接进入统一实体表。显式 uid 必须等于
         seed + kind + 格坐标推导出的独立身份，不能冒充遗迹/建筑等实体。 */
      if(options.requireObservationUid&&hasUid&&
        record.uid!==observationResourceUid(worldSeed,record.kind,record.gx,record.gy))return 'invalid-resource-uid';
      if(typeof record.yieldItemId!=='string'||!record.yieldItemId)return 'invalid-resource-yield';
      if(!(record.amount>0)||!isFinite(record.amount))return 'invalid-resource-amount';
      if((!allowMissing||Object.prototype.hasOwnProperty.call(record,'hp'))&&
        (!(record.hp>0)||!isFinite(record.hp)))return 'invalid-resource-hp';
      if((!allowMissing||Object.prototype.hasOwnProperty.call(record,'seed'))&&
        (typeof record.seed!=='number'||!isFinite(record.seed)||record.seed!==(record.seed>>>0)))return 'invalid-resource-seed';
      if((!allowMissing||Object.prototype.hasOwnProperty.call(record,'regenTicks'))&&
        (!isFinite(record.regenTicks)||record.regenTicks!==(record.regenTicks|0)||record.regenTicks<0))return 'invalid-resource-regen';
      /* PlanetSpec 里的自然资源是 seed + 坐标推导出的不可变事实，不能只做类型检查。
         任务矿点只允许显式调节耐久和产量，其余身份字段仍必须与共享语义一致。 */
      var canonical=resourceRecord(worldSeed,record.kind,record.gx,record.gy,null,record.uid,record.variantId||record.variant);
      if(!canonical)return 'unknown-resource-kind:'+String(record.kind||'');
      function differs(key){return (!allowMissing||Object.prototype.hasOwnProperty.call(record,key))&&record[key]!==canonical[key];}
      if(record.yieldItemId!==canonical.yieldItemId)return 'invalid-resource-yield:'+record.yieldItemId;
      if(!options.allowTunedAmountHp&&record.amount!==canonical.amount)return 'invalid-resource-amount';
      if(differs('visualKind'))return 'invalid-resource-visual';
      if(!options.allowTunedAmountHp&&differs('hp'))return 'invalid-resource-hp';
      if(differs('depleted'))return 'invalid-resource-depleted';
      if(differs('seed'))return 'invalid-resource-seed';
      if(differs('renewable'))return 'invalid-resource-renewable';
      if(differs('regenTicks'))return 'invalid-resource-regen';
      var hasSeedItem=Object.prototype.hasOwnProperty.call(record,'seedItem');
      if((!allowMissing||hasSeedItem)&&(hasSeedItem!==Object.prototype.hasOwnProperty.call(canonical,'seedItem')||
        record.seedItem!==canonical.seedItem))return 'invalid-resource-seed-item';
      if((!allowMissing||Object.prototype.hasOwnProperty.call(record,'exposureRisk'))&&
        (record.exposureRisk===true)!==(canonical.exposureRisk===true))return 'invalid-resource-flags';
      if((!allowMissing||Object.prototype.hasOwnProperty.call(record,'mineral'))&&
        (record.mineral===true)!==(canonical.mineral===true))return 'invalid-resource-flags';
    }
    return null;
  }

  function landingCell(){
    return {gx:Math.floor(CFG.HAB.x/GRID),gy:Math.floor(CFG.HAB.y/GRID)};
  }
  function inLandingSafeZone(gx,gy,radius){
    var landing=landingCell();
    return Math.abs(gx-landing.gx)<=radius&&Math.abs(gy-landing.gy)<=radius;
  }

  function home(seed){
    return { v:1, width:HOME_SIZE, height:HOME_SIZE, grid:GRID,
      seed:u32(n(seed, 7)), kind:'home', generation:HOME_GENERATION, resourceVersion:2 };
  }
  function legacy(seed, kind){
    return { v:1, width:LEGACY_SIZE, height:LEGACY_SIZE, grid:GRID,
      seed:u32(n(seed, 7)), kind:kind||'home', generation:LEGACY_GENERATION };
  }
  var observationValidity=new WeakMap(), observationRevisions=new WeakMap(), nextObservationRevision=1;
  function validVersionedObservation(o){
    if(typeof o.v!=='number'||o.v<1||o.v!==(o.v|0)||
      o.widthCells<=0||o.widthCells!==(o.widthCells|0)||
      o.heightCells<=0||o.heightCells!==(o.heightCells|0)||
      typeof o.biomeId!=='string'||!o.biomeId||typeof o.degraded!=='boolean'||
      !Array.isArray(o.ground)||o.ground.length!==o.widthCells*o.heightCells||!Array.isArray(o.resources)) return false;
    var i,resource,seen=Object.create(null),seenUid=Object.create(null);
    for(i=0;i<o.ground.length;i++) if(typeof o.ground[i]!=='string'||!o.ground[i]) return false;
    for(i=0;i<o.resources.length;i++){
      resource=o.resources[i];
      if(!resource||resource.gx!==(resource.gx|0)||resource.gy!==(resource.gy|0)||
        resource.gx<0||resource.gy<0||resource.gx>=o.widthCells||resource.gy>=o.heightCells||
        typeof resource.kind!=='string'||!resource.kind||typeof resource.yieldItemId!=='string'||!resource.yieldItemId||
        (resource.uid!=null&&(typeof resource.uid!=='string'||!resource.uid||seenUid[resource.uid]))||
        typeof resource.amount!=='number'||!isFinite(resource.amount)||resource.amount<0||seen[resource.gx+','+resource.gy]) return false;
      seen[resource.gx+','+resource.gy]=true;if(resource.uid!=null)seenUid[resource.uid]=true;
    }
    return true;
  }
  function validLegacyObservation(o){
    if(o.v!==undefined||!Array.isArray(o.grid)||!o.grid.length||!Array.isArray(o.grid[0])||!o.grid[0].length) return false;
    var width=o.grid[0].length;
    for(var y=0;y<o.grid.length;y++){
      if(!Array.isArray(o.grid[y])||o.grid[y].length!==width) return false;
      for(var x=0;x<width;x++) if(typeof o.grid[y][x]!=='string'||!o.grid[y][x]) return false;
    }
    return true;
  }
  function hasObservation(scene){
    var o=scene&&scene.observation;
    if(!o||typeof o!=='object') return false;
    if(observationValidity.has(o)) return observationValidity.get(o);
    var valid=o.v!==undefined?validVersionedObservation(o):validLegacyObservation(o);
    /* PR #196 前身曾写入无版本二维 grid；只兼容这一种历史格式。
       带版本的新格式必须保留 v1 行优先基础字段，不能借 grid 绕过版本保护。 */
    observationValidity.set(o,valid);
    return valid;
  }
  function observationShape(o){
    if(o&&o.widthCells>0&&o.heightCells>0) return {widthCells:o.widthCells,heightCells:o.heightCells};
    return {widthCells:o&&o.grid&&o.grid[0]?o.grid[0].length:0,
      heightCells:o&&o.grid?o.grid.length:0};
  }

  function homeObservation(seed){
    seed=u32(n(seed,7));
    var scene=home(seed),widthCells=Math.ceil(scene.width/scene.grid),heightCells=Math.ceil(scene.height/scene.grid);
    var observation=APH.Observe.observe({seed:seed,biomeId:'biome_landing',widthCells:widthCells,heightCells:heightCells,home:true});
    var profile=CFG.observe.biomes.biome_landing,rules=CFG.observe.resourceSemantics;
    var resources=[],used={};
    var semanticFields={gx:1,gy:1,kind:1,uid:1,yieldItemId:1,amount:1,seedItem:1,
      exposureRisk:1,repairable:1,repairBid:1,coreWreckage:1};
    function resolvedRule(kind,variantId){
      var base=rules[kind],variant=variantId&&base&&base.variants&&base.variants[variantId],out={},key;
      if(!base||(variantId&&!variant)) return null;
      for(key in base) if(base.hasOwnProperty(key)&&key!=='variants') out[key]=base[key];
      if(variant) for(key in variant) if(variant.hasOwnProperty(key)) out[key]=variant[key];
      return out;
    }
    function add(kind,gx,gy,extra,uid,variantId){
      var key=gx+','+gy,cell=APH.Observe.cellAt(observation,gx,gy),allowed=profile.resourceGround[kind]||[],rule=resolvedRule(kind,variantId);
      if(used[key]||!cell||!cell.walkable||!rule||allowed.indexOf(cell.tile)===-1) return false;
      var yieldItemId=rule.yieldItemId;
      if(Array.isArray(rule.yieldItemIds)&&rule.yieldItemIds.length){
        yieldItemId=rule.yieldItemIds[hash(seed,gx+(rule.yieldSalt||0),gy)%rule.yieldItemIds.length];
      }
      var record={gx:gx,gy:gy,kind:kind,uid:uid||('obs_'+seed+'_'+kind+'_'+gx+'_'+gy),
        yieldItemId:yieldItemId,amount:rule.amount};
      if(extra) Object.keys(extra).forEach(function(k){if(!semanticFields[k])record[k]=extra[k];});
      if(rule.seedItemFromYield) record.seedItem=record.yieldItemId;
      if(rule.exposureRisk) record.exposureRisk=true;
      if(rule.repairable!==false&&typeof rule.repairableCutoff==='number'){
        record.repairable=rand(seed,gx,gy)<rule.repairableCutoff;record.repairBid=rule.repairBid;
      }
      if(rule.coreWreckage) record.coreWreckage=true;
      resources.push(record);used[key]=true;return true;
    }
    (observation.resources||[]).forEach(function(source){
      var traits={critical:true},key;
      for(key in source) if(source.hasOwnProperty(key)) traits[key]=source[key];
      add(source.kind,source.gx,source.gy,traits,source.uid);
    });
    var critical=CFG.observe.homeCriticalResources,berry=critical.starterBerries,starterBerries=0;
    for(var b=0;starterBerries<berry.count&&b<berry.attempts;b++){
      if(add(berry.kind,berry.startGX+(b%berry.columns)*berry.stepX,
        berry.startGY+Math.floor(b/berry.columns),berry.traits)) starterBerries++;
    }
    var core=critical.coreWreckage;
    add(core.kind,core.gx,core.gy,null,null,core.variant);
    var scatter=CFG.observe.homeResourceScatter||{};
    for(var gy=0;gy<heightCells;gy++) for(var gx=0;gx<widthCells;gx++){
      if(used[gx+','+gy]) continue;
      var cell=APH.Observe.cellAt(observation,gx,gy),roll=rand(seed,gx,gy),kind=null,choices=scatter[cell.tile]||[];
      for(var ci=0;ci<choices.length;ci++) if(roll<choices[ci].max){kind=choices[ci].kind;break;}
      if(kind) add(kind,gx,gy);
    }
    observation.resources=resources;
    return observation;
  }

  /* 远征 Observation 在第一次发现时一次性冻结自然资源。之后的着陆、刷新、
     重访都只实体化这份清单，不再运行第二套 flora/rock scatter。 */
  function planetObservation(opts){
    opts=opts||{};
    var seed=u32(n(opts.seed,7)),biomeId=opts.biomeId;
    var widthCells=Math.max(1,Math.floor(n(opts.widthCells,Math.ceil(LEGACY_SIZE/GRID))));
    var heightCells=Math.max(1,Math.floor(n(opts.heightCells,Math.ceil(LEGACY_SIZE/GRID))));
    var observation=APH.Observe.observe({seed:seed,biomeId:biomeId,widthCells:widthCells,
      heightCells:heightCells,groundPins:opts.groundPins||[],allowWater:opts.allowWater});
    var profile=CFG.observe.biomes&&CFG.observe.biomes[biomeId];
    var scatter=CFG.observe.expeditionResourceScatter&&CFG.observe.expeditionResourceScatter[biomeId]||{};
    var minimums=CFG.observe.expeditionResourceMinimums&&CFG.observe.expeditionResourceMinimums[biomeId]||[];
    var safeRadius=Math.max(0,Math.floor(n(opts.safeRadius,CFG.expedition.landingSafeRadiusCells||0)));
    var resources=[],used={},counts={},reserved={};
    (opts.reservedCells||[]).forEach(function(cell){
      if(cell&&cell.gx===(cell.gx|0)&&cell.gy===(cell.gy|0))reserved[cell.gx+','+cell.gy]=true;
    });
    function add(kind,gx,gy,extra){
      var key=gx+','+gy,cell=APH.Observe.cellAt(observation,gx,gy),allowed=profile&&profile.resourceGround&&profile.resourceGround[kind];
      if(used[key]||reserved[key]||inLandingSafeZone(gx,gy,safeRadius)||!cell||!cell.walkable||
        !Array.isArray(allowed)||allowed.indexOf(cell.tile)<0)return false;
      var record=resourceRecord(seed,kind,gx,gy,extra);
      if(!record||resourceError(record,true,seed))return false;
      used[key]=true;resources.push(record);counts[kind]=(counts[kind]||0)+1;return true;
    }
    for(var gy=0;gy<heightCells;gy++)for(var gx=0;gx<widthCells;gx++){
      var cell=APH.Observe.cellAt(observation,gx,gy),choices=cell&&scatter[cell.tile]||[];
      var roll=rand(seed^stringSalt(biomeId),gx,gy),kind=null;
      for(var ci=0;ci<choices.length;ci++)if(roll<choices[ci].max){kind=choices[ci].kind;break;}
      if(kind)add(kind,gx,gy);
    }
    /* 密集水域也必须有限结束：从 seed 起点遍历整张有限格表，能补则补；
       若群系已没有合法格，返回现有事实而不是无限重试。 */
    var total=widthCells*heightCells;
    minimums.forEach(function(minimum,mi){
      var need=Math.max(0,Math.floor(n(minimum&&minimum.count,0)))-(counts[minimum&&minimum.kind]||0);
      var start=total?hash(seed^stringSalt(minimum&&minimum.kind),mi,total)%total:0;
      for(var scan=0;need>0&&scan<total;scan++){
        var index=(start+scan)%total;
        if(add(minimum.kind,index%widthCells,Math.floor(index/widthCells)))need--;
      }
    });
    observation.resources=resources;
    return observation;
  }

  function newHome(seed){
    var scene=home(seed);
    scene.observation=homeObservation(scene.seed);
    return scene;
  }
  function planet(spec){
    spec=spec||{};
    return {v:1,kind:'expedition',generation:HOME_GENERATION,seed:u32(n(spec.seed,7)),
      grid:GRID,observation:spec.observation};
  }
  function observed(scene){
    var d={},key,o=scene.observation,shape=observationShape(o),grid=n(scene.grid,GRID);
    if(!(grid>0))grid=GRID;
    for(key in scene) if(scene.hasOwnProperty(key)) d[key]=scene[key];
    d.v=n(scene.v,1);
    d.grid=grid;
    /* Observation 是已观测世界的格网事实源；外层旧尺寸只能作为未观测档案的兼容字段。 */
    d.width=shape.widthCells*grid;
    d.height=shape.heightCells*grid;
    d.seed=u32(n(scene.seed,7));
    d.kind=scene.kind||'planet';
    d.generation=HOME_GENERATION;
    return d;
  }
  function normalize(scene){
    if(!scene || scene.generation===0) return legacy(scene&&scene.seed, scene&&scene.kind);
    if(hasObservation(scene)) return observed(scene);
    if(scene.width===LEGACY_SIZE) return legacy(scene.seed,scene.kind);
    if(scene.kind==='home' && scene.generation===HOME_GENERATION && scene.width===HOME_SIZE && scene.height===HOME_SIZE){var d=home(scene.seed);d.resourceVersion=scene.resourceVersion===2?2:1;return d;}
    return legacy(scene&&scene.seed, scene&&scene.kind);
  }
  function dimensions(scene){
    var d=normalize(scene),grid=n(d.grid,GRID),width=n(d.width,LEGACY_SIZE),height=n(d.height,LEGACY_SIZE);
    if(!(grid>0))grid=GRID;
    return {grid:grid,width:width,height:height,cols:Math.ceil(width/grid),rows:Math.ceil(height/grid)};
  }
  function revision(scene){
    var d=normalize(scene),o=d.observation,oid='procedural';
    if(o&&typeof o==='object'){
      if(!observationRevisions.has(o)) observationRevisions.set(o,nextObservationRevision++);
      oid='observation-'+observationRevisions.get(o);
    }
    return [d.kind,d.generation,d.seed,d.width,d.height,d.grid,oid].join(':');
  }

  function snapshotObservation(scene){
    var d=normalize(scene);
    if(d.generation!==HOME_GENERATION) return null;
    if(hasObservation(d)) return d.observation;
    var widthCells=Math.ceil(d.width/d.grid),heightCells=Math.ceil(d.height/d.grid),ground=[];
    for(var gy=0;gy<heightCells;gy++) for(var gx=0;gx<widthCells;gx++){
      ground.push(cellAt(d,(gx+.5)*d.grid,(gy+.5)*d.grid).region);
    }
    var initial=resources(d,{}).map(function(source){
      var record={gx:Math.floor(source.x/d.grid),gy:Math.floor(source.y/d.grid)},key;
      for(key in source) if(source.hasOwnProperty(key)&&key!=='x'&&key!=='y'&&key!=='type') record[key]=source[key];
      return record;
    });
    return {v:1,widthCells:widthCells,heightCells:heightCells,biomeId:'biome_landing',degraded:false,
      ground:ground,resources:initial};
  }
  function isHome(scene){ return normalize(scene).generation===HOME_GENERATION; }
  function regionById(id){
    for(var i=0;i<REGIONS.length;i++) if(REGIONS[i].id===id) return REGIONS[i];
    return REGIONS[4];
  }
  function regionAtGrid(scene, gx, gy){
    var d=normalize(scene), shift=(d.seed%7)-3, shoreY=48+(d.seed%5), splitX=68+shift;
    /* 出生锚点始终覆盖既有 HAB(1100,1100 即格 22,22)，避免把接线人拖进大搬家。 */
    if(gx>=13 && gx<33 && gy>=13 && gy<33) return regionById('landing');
    /* 与 landing 相接的前 20×20 格为第二块保底建地。 */
    if(gx>=33 && gx<53 && gy>=13 && gy<33) return regionById('woodland');
    if(gy>=shoreY && gy<shoreY+20) return regionById('lakeshore');
    if(gy<shoreY && gx>=75+shift) return regionById('ridge');
    if(gy>=shoreY+20 && gx>=splitX) return regionById('wreckage');
    if(gx>=33 && gy<shoreY) return regionById('woodland');
    return regionById('alien');
  }
  function waterCell(scene, gx, gy){
    if(!isHome(scene) || regionAtGrid(scene,gx,gy).id!=='lakeshore') return false;
    var lake=landmarks(scene).lake, x=(gx+.5)*GRID, y=(gy+.5)*GRID;
    /* 湖面+浅水道：水不可走，岸线其余位置仍连通。 */
    if((x-lake.x)*(x-lake.x)+(y-lake.y)*(y-lake.y)<lake.r*lake.r) return true;
    return (gx*7 + gy*11 + (normalize(scene).seed%31))%29===0;
  }
  function cellAt(scene, x, y){
    var d=normalize(scene), gx=Math.floor(n(x,-1)/d.grid), gy=Math.floor(n(y,-1)/d.grid);
    if(gx<0 || gy<0 || gx>=Math.ceil(d.width/d.grid) || gy>=Math.ceil(d.height/d.grid)){
      return { tile:null,region:'void',water:false,shore:false,color:null,
        walkable:false,buildable:false,fertility:0,moveCost:Infinity };
    }
    if(d.generation===LEGACY_GENERATION){
      return { tile:'legacy',region:'legacy',water:false,shore:false,color:null,
        walkable:true,buildable:true,fertility:.5,moveCost:1 };
    }
    if(d.observation&&APH.Observe&&APH.Observe.cellAt){
      var observedCell=APH.Observe.cellAt(d.observation,gx,gy);
      if(!observedCell) return {tile:null,region:'void',water:false,shore:false,color:null,
        walkable:false,buildable:false,fertility:0,moveCost:Infinity};
      var observedSemantics=CFG.observe.tileSemantics[observedCell.tile]||{};
      return {tile:observedCell.tile,region:observedCell.water?'water':observedCell.region,
        water:observedCell.water,shore:observedCell.shore,color:observedSemantics.color||null,
        walkable:observedCell.walkable,buildable:observedCell.buildable,
        fertility:observedCell.fertility,moveCost:observedCell.moveCost};
    }
    var r=regionAtGrid(d,gx,gy);
    var water=waterCell(d,gx,gy);
    var tile=water?'water':r.id,semantics=CFG.observe.tileSemantics[tile]||{};
    return {tile:tile,region:water?'water':r.id,water:water,shore:semantics.shore===true,
      color:semantics.color||r.color,walkable:!water,buildable:!water,
      fertility:water?0:r.fertility,moveCost:water?Infinity:r.moveCost };
  }
  /* 原地形的普通土倍率是 1；TerrainModel 的 .5 也代表普通土。
     将它归一化后，湖岸能高产、矿丘会贫瘠，而 generation 0 不改变旧档。 */
  function fertilityMultiplier(scene, x, y){
    var d=normalize(scene);
    if(d.generation===LEGACY_GENERATION) return 1;
    var fertility=cellAt(d,x,y).fertility;
    return Math.max(0, fertility/.5);
  }
  function landmarks(scene){
    var d=normalize(scene);
    if(d.generation===LEGACY_GENERATION) return { hab:{x:1100,y:1100,r:92}, lake:{x:1660,y:1560,r:148} };
    if(d.observation) return {hab:{x:1100,y:1100,r:92},lake:{x:0,y:0,r:0}};
    return { hab:{x:1100,y:1100,r:92}, lake:{x:GRID*84,y:GRID*(58+d.seed%5),r:GRID*8} };
  }
  function resource(uid, kind, gx, gy, amount, extra, grid){
    grid=grid||GRID;
    var o={id:uid,uid:uid, type:'flora', kind:kind, x:(gx+.5)*grid, y:(gy+.5)*grid, amount:amount};
    if(extra) Object.keys(extra).forEach(function(k){ o[k]=extra[k]; });
    return o;
  }
  function resources(scene, depleted){
    var gone=depleted||{}, out=[],errors=[];
    Object.defineProperty(out,'errors',{value:errors,enumerable:false});
    if(scene&&scene.generation!==LEGACY_GENERATION&&scene.observation&&!hasObservation(scene)){
      errors.push({error:'invalid-observation'});return out;
    }
    var d=normalize(scene);
    if(d.generation===LEGACY_GENERATION) return out;
    var prefix='tm_'+d.seed+'_g'+d.generation+'_', used=Object.create(null),usedIds=Object.create(null);
    function add(kind,gx,gy,extra,explicitUid){
      var key=gx+','+gy, c=cellAt(d,(gx+.5)*GRID,(gy+.5)*GRID);
      if(used[key] || !c.walkable) return false;
      var uid=explicitUid||prefix+'flora_'+kind+'_'+gx+'_'+gy;
      if(usedIds[uid]){errors.push({uid:uid,kind:kind,error:'duplicate-resource-uid'});return false;}
      var record=resourceRecord(d.seed,kind,gx,gy,extra,uid,extra&&(extra.variantId||extra.variant));
      var error=record?resourceError(record,false):'unknown-resource-kind:'+String(kind||'');
      if(error){errors.push({uid:uid,kind:kind,error:error});return false;}
      var rule=resolvedResourceRule(kind,record.variantId||record.variant),mineral=rule.mineral===true;
      if(mineral&&gone[uid]){record.depleted=true;record.mineralRemains=true;}
      if(record.depleted){record.amount=0;if(mineral)record.mineralRemains=true;}
      used[key]=true;usedIds[uid]=true;
      var flags={},recordKey;
      for(recordKey in record)if(record.hasOwnProperty(recordKey)&&recordKey!=='gx'&&recordKey!=='gy'&&recordKey!=='kind'&&recordKey!=='uid'&&recordKey!=='amount')flags[recordKey]=record[recordKey];
      flags.hp=record.hp;flags.maxHp=record.hp;
      out.push(resource(uid,kind,gx,gy,record.depleted?0:record.amount,flags,d.grid));
      return true;
    }
    if(d.observation){
      var observedResources=Array.isArray(d.observation.resources)?d.observation.resources:[];
      var observedCells=Object.create(null);
      for(var oi=0;oi<observedResources.length;oi++){
        var source=observedResources[oi],extra={},sourceKey;
        if(!source||!source.kind) continue;
        var observedCell=source.gx+','+source.gy;
        if(observedCells[observedCell]){
          errors.push({uid:source.uid,kind:source.kind,error:'duplicate-resource-cell'});continue;
        }
        observedCells[observedCell]=true;
        if(d.kind==='expedition'){
          var sourceError=resourceError(source,true,d.seed,{allowMissingDerived:true,requireObservationUid:true});
          if(sourceError){errors.push({uid:source.uid,kind:source.kind,error:sourceError});continue;}
        }
        for(sourceKey in source) if(source.hasOwnProperty(sourceKey)&&sourceKey!=='gx'&&sourceKey!=='gy'&&sourceKey!=='kind'&&sourceKey!=='uid') extra[sourceKey]=source[sourceKey];
        add(source.kind,source.gx,source.gy,extra,source.uid||('obs_'+d.seed+'_'+source.kind+'_'+source.gx+'_'+source.gy));
      }
      return out;
    }
    /* 首夜保障放在旧 HAB 的 300–500px 环内，不等玩家走半张图才拿到木石。 */
    for(var i=0;i<24;i++){
      var a=i*Math.PI*2/24, r=8; /* 384px 环，格心舍入后仍在 300–500 内 */
      add('tree',Math.round(1100/GRID+Math.cos(a)*r),Math.round(1100/GRID+Math.sin(a)*r),{critical:true,starter:true});
    }
    for(var j=0;j<18;j++){
      var a2=j*Math.PI*2/18+0.19, r2=9; /* 与木环错开，避免首夜石料互相踩格 */
      add('rock_stone',Math.round(1100/GRID+Math.cos(a2)*r2),Math.round(1100/GRID+Math.sin(a2)*r2),{critical:true,starter:true});
    }
    /* 三人两天：12 丛既有 bush_berry，每丛仍按现有实现产 3 个 it_berry。 */
    var starterBerries=0;
    if(d.resourceVersion!==2){
      for(var b=0;b<12;b++)add('bush_berry',14+(b%4)*3,31+Math.floor(b/4)*3,{critical:true,days:2,forColonists:3});
    }else for(var b=0;starterBerries<12&&b<32;b++){
      if(add('bush_berry',14+(b%4)*3,31+Math.floor(b/4)*2,{critical:true,days:2,forColonists:3}))starterBerries++;
    }
    /* The landing core remains a finite source in the first clearing. */
    if(d.resourceVersion===2)add('rock_wreckage',25,24,{yieldItemId:'it_alloy',amount:8,coreWreckage:true});

    /* 128×128 格按 region+seed 的哈希密度铺出约 2,000 个真实 flora 描述。
       所有资源 uid 包含种子及格坐标；相同 descriptor 重建永远得到同一清单。 */
    for(var gy=0;gy<128;gy++) for(var gx=0;gx<128;gx++){
      var c=cellAt(d,(gx+.5)*GRID,(gy+.5)*GRID);
      if(!c.walkable || used[gx+','+gy]) continue;
      var roll=rand(d.seed,gx,gy), kind=null;
      if(c.region==='woodland' && roll<.24) kind=roll<.18?'tree':'bush_herb';
      else if(c.region==='ridge' && roll<.18) kind=roll<.11?'rock_stone':'rock_iron';
      else if(c.region==='lakeshore' && roll<.10) kind=roll<.07?'bush_berry':'bush_herb';
      else if(c.region==='alien' && roll<.07) kind=roll<.036?'bush_berry':(roll<.052?'bush_herb':'tree');
      else if(c.region==='wreckage' && roll<.14) kind=roll<.068?'rock_iron':(roll<.112?'rock_stone':'tree');
      if(kind){var extra={critical:(gx===80&&gy===20)||(gx===60&&gy===75)};
        if(d.resourceVersion===2&&c.region==='alien'){kind='bush_alien';var samples=['specimen_dew','specimen_flora_glow','specimen_crystal_vine','specimen_star_velvet'];extra.yieldItemId=samples[hash(d.seed,gx+313,gy)%4];extra.seedItem=extra.yieldItemId;extra.amount=1;extra.exposureRisk=true;}
        if(d.resourceVersion===2&&c.region==='wreckage'){kind='rock_wreckage';extra.yieldItemId='it_alloy';extra.amount=2;extra.repairable=roll<.008;extra.repairBid='bl_solar_panel';}
        add(kind,gx,gy,extra);
      }
    }
    return out;
  }

  function footprintAt(gx,gy,footprint){
    var w=Math.max(1,Math.floor(n(footprint&&footprint[0],1)));
    var h=Math.max(1,Math.floor(n(footprint&&footprint[1],1))),cells=[];
    for(var y=0;y<h;y++)for(var x=0;x<w;x++)cells.push({gx:gx+x,gy:gy+y});
    return {w:w,h:h,cells:cells};
  }
  function reserveCells(occupied,cells,label){
    occupied=occupied||{};
    (cells||[]).forEach(function(cell){occupied[cell.gx+','+cell.gy]=label||true;});
    return occupied;
  }
  function findOverlayPlacement(scene,opts){
    opts=opts||{};
    var d=normalize(scene),dims=dimensions(d),shape=footprintAt(0,0,opts.footprint);
    var maxGX=dims.cols-shape.w,maxGY=dims.rows-shape.h;
    var occupied=opts.occupied||{},origin=opts.origin||landingCell(),safeOrigin=opts.safeOrigin||landingCell();
    var safe=Math.max(0,Math.floor(n(opts.safeRadius,CFG.expedition.overlaySafeRadiusCells||0)));
    var minDistance=Math.max(0,n(opts.minDistance,0)),maxDistance=n(opts.maxDistance,Infinity);
    var tries=Math.max(0,Math.floor(n(opts.tries,CFG.expedition.overlayTries||0)));
    var seed=u32(n(opts.seed,d.seed)^u32(n(opts.salt,0)));
    function candidate(gx,gy,fallback,attempts){
      if(gx<0||gy<0||gx>maxGX||gy>maxGY)return null;
      var footprint=footprintAt(gx,gy,[shape.w,shape.h]);
      for(var i=0;i<footprint.cells.length;i++){
        var cell=footprint.cells[i],key=cell.gx+','+cell.gy;
        if(occupied[key]||(Math.abs(cell.gx-safeOrigin.gx)<=safe&&Math.abs(cell.gy-safeOrigin.gy)<=safe))return null;
        if(!cellAt(d,(cell.gx+.5)*dims.grid,(cell.gy+.5)*dims.grid).walkable)return null;
      }
      var centerGX=gx+(shape.w-1)/2,centerGY=gy+(shape.h-1)/2;
      var distance=Math.sqrt(Math.pow(centerGX-origin.gx,2)+Math.pow(centerGY-origin.gy,2));
      if(distance<minDistance||distance>maxDistance)return null;
      return {ok:true,gx:gx,gy:gy,x:(gx+shape.w/2)*dims.grid,y:(gy+shape.h/2)*dims.grid,
        w:shape.w,h:shape.h,cells:footprint.cells,fallback:!!fallback,attempts:attempts};
    }
    if(maxGX<0||maxGY<0)return {ok:false,why:'no-valid-footprint',attempts:0};
    var rng=U.makeRng(seed||1),result,attempt=0;
    for(;attempt<tries;attempt++){
      result=candidate(Math.floor(rng()*(maxGX+1)),Math.floor(rng()*(maxGY+1)),false,attempt+1);
      if(result)return result;
    }
    var total=(maxGX+1)*(maxGY+1),start=total?hash(seed,shape.w,shape.h)%total:0;
    for(var scan=0;scan<total;scan++){
      var index=(start+scan)%total;
      result=candidate(index%(maxGX+1),Math.floor(index/(maxGX+1)),true,attempt+scan+1);
      if(result)return result;
    }
    return {ok:false,why:'no-valid-footprint',attempts:attempt+total};
  }
  function regionColor(scene, x, y, fallback){
    var c=cellAt(scene,x,y);
    return c.color || fallback || '#1c2419';
  }

  return { HOME_SIZE:HOME_SIZE, LEGACY_SIZE:LEGACY_SIZE, GRID:GRID, REGIONS:REGIONS,
    home:home, newHome:newHome, planet:planet, homeObservation:homeObservation, planetObservation:planetObservation, snapshotObservation:snapshotObservation,
    legacy:legacy, normalize:normalize, dimensions:dimensions, revision:revision,
    hasObservation:hasObservation, isHome:isHome, cellAt:cellAt,
    landmarks:landmarks, resources:resources, regionColor:regionColor,
    resourceRecord:resourceRecord,resourceError:resourceError,
    findOverlayPlacement:findOverlayPlacement,reserveCells:reserveCells,
    fertilityMultiplier:fertilityMultiplier };
})();
