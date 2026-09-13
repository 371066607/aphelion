/* ============================================================
   Aphelion · observe.js — 从群系砖表观测复合格网 (ADR-48)
   纯数据层：不读 APH.state、不写存档、不创建实体或 canvas。
   ============================================================ */
window.APH = window.APH || {};

APH.Observe = (function(){
  'use strict';

  var CFG=APH.CFG,U=APH.U;

  var BASE_GROUND = {
    biome_landing:'landing',
    biome_spore_forest:'spore_moss',
    biome_crystal_wasteland:'silica',
    biome_acid_marsh:'peat',
    biome_cryo_tundra:'permafrost'
  };

  function positiveInt(value, fallback){
    value=value|0;
    return value>0?value:fallback;
  }

  function homePins(widthCells,heightCells){
    var cfg=CFG.observe||{};
    var grid=CFG.GRID||48;
    var hab=CFG.HAB||{x:1100,y:1100};
    var cx=Math.round(hab.x/grid),cy=Math.round(hab.y/grid);
    var half=Math.floor(positiveInt(cfg.habCells,20)/2);
    var gx,gy,i,angle,used={};
    var out={ground:[],resources:[]};
    for(gy=cy-half;gy<cy+half;gy++) for(gx=cx-half;gx<cx+half;gx++){
      if(gx>=0&&gy>=0&&gx<widthCells&&gy<heightCells) out.ground.push({gx:gx,gy:gy,tile:'landing'});
    }
    function ring(kind,count,radius,offset){
      for(i=0;i<count;i++){
        angle=i*Math.PI*2/count+offset;
        gx=Math.round(cx+Math.cos(angle)*radius);
        gy=Math.round(cy+Math.sin(angle)*radius);
        var key=gx+','+gy;
        if(gx<0||gy<0||gx>=widthCells||gy>=heightCells||used[key]) continue;
        used[key]=true;
        out.resources.push({gx:gx,gy:gy,kind:kind,starter:true});
      }
    }
    ring('tree',positiveInt(cfg.starterWood,24),positiveInt(cfg.starterWoodRing,8),0);
    ring('rock_stone',positiveInt(cfg.starterStone,18),positiveInt(cfg.starterStoneRing,9),Number(cfg.starterStoneAngle)||0);
    return out;
  }

  function pickWeighted(tiles,rng,left,up,sameWeight){
    var total=0,i;
    function weight(tile){
      var w=tile.weight;
      if(tile.id===left) w*=sameWeight;
      if(tile.id===up) w*=sameWeight;
      return w;
    }
    for(i=0;i<tiles.length;i++) total+=weight(tiles[i]);
    var choice=rng()*total;
    for(i=0;i<tiles.length;i++){
      choice-=weight(tiles[i]);
      if(choice<=0) return tiles[i].id;
    }
    return tiles[tiles.length-1].id;
  }

  function adjacencyOf(profile){
    var adj={},i,j,k,group,pair;
    for(i=0;i<profile.tiles.length;i++) adj[profile.tiles[i].id]={};
    for(i=0;i<(profile.bonds||[]).length;i++){
      group=profile.bonds[i];
      for(j=0;j<group.length;j++) for(k=j;k<group.length;k++){
        if(adj[group[j]]&&adj[group[k]]){
          adj[group[j]][group[k]]=true;
          adj[group[k]][group[j]]=true;
        }
      }
    }
    for(i=0;i<(profile.forbid||[]).length;i++){
      pair=profile.forbid[i];
      if(adj[pair[0]]) delete adj[pair[0]][pair[1]];
      if(adj[pair[1]]) delete adj[pair[1]][pair[0]];
    }
    return adj;
  }

  function groundAllowed(profile,tile,allowWater){
    if(!profile||!Array.isArray(profile.tiles)) return false;
    var found=false;
    for(var i=0;i<profile.tiles.length;i++) if(profile.tiles[i].id===tile){found=true;break;}
    if(!found) return false;
    var semantics=CFG.observe.tileSemantics[tile]||{};
    return allowWater!==false||(!semantics.water&&!semantics.shore);
  }

  function normalizeGroundPins(pins,profile,widthCells,heightCells,allowWater){
    var byCell={},order=[],invalid=false;
    for(var i=0;i<pins.length;i++){
      var pin=pins[i];
      if(!pin||pin.gx!==(pin.gx|0)||pin.gy!==(pin.gy|0)||pin.gx<0||pin.gy<0||
        pin.gx>=widthCells||pin.gy>=heightCells||!groundAllowed(profile,pin.tile,allowWater)){
        invalid=true;continue;
      }
      var key=pin.gx+','+pin.gy;
      if(!byCell[key]) order.push(key);
      byCell[key]={gx:pin.gx,gy:pin.gy,tile:pin.tile};
    }
    return {pins:order.map(function(key){return byCell[key];}),invalid:invalid};
  }

  function pinMap(pins,widthCells,heightCells){
    var map={},i,p;
    for(i=0;i<pins.length;i++){
      p=pins[i];
      if(!p||p.gx<0||p.gy<0||p.gx>=widthCells||p.gy>=heightCells||!p.tile) continue;
      map[p.gy*widthCells+p.gx]=p.tile;
    }
    return map;
  }

  function canTouch(adj,a,b){ return !!(adj[a]&&adj[a][b]); }

  function resourceAllowed(profile,kind,tile){
    var grounds=profile&&profile.resourceGround&&profile.resourceGround[kind];
    return Array.isArray(grounds)&&grounds.indexOf(tile)!==-1;
  }

  function resourceMap(resources,widthCells){
    var map={};
    for(var i=0;i<resources.length;i++) map[resources[i].gy*widthCells+resources[i].gx]=resources[i];
    return map;
  }

  function solve(profile,widthCells,heightCells,pins,resources,allowWater,rng){
    var semantics=CFG.observe.tileSemantics;
    var tiles=profile.tiles.filter(function(tile){
      var s=semantics[tile.id]||{};
      return allowWater!==false||(!s.water&&!s.shore);
    });
    var adj=adjacencyOf(profile),pinned=pinMap(pins,widthCells,heightCells),resourcePins=resourceMap(resources,widthCells),ground=[];
    var i,x,y,left,up,rightPin,downPin,candidates,pinnedTile,pinnedResource;
    if(!tiles.length) return null;
    for(i=0;i<widthCells*heightCells;i++){
      x=i%widthCells;y=(i-x)/widthCells;
      left=x>0?ground[i-1]:null;
      up=y>0?ground[i-widthCells]:null;
      rightPin=x+1<widthCells?pinned[i+1]:null;
      downPin=y+1<heightCells?pinned[i+widthCells]:null;
      pinnedTile=pinned[i];
      pinnedResource=resourcePins[i];
      candidates=tiles.filter(function(tile){
        if(pinnedTile&&tile.id!==pinnedTile) return false;
        if(left&&!canTouch(adj,left,tile.id)) return false;
        if(up&&!canTouch(adj,up,tile.id)) return false;
        if(rightPin&&!canTouch(adj,tile.id,rightPin)) return false;
        if(downPin&&!canTouch(adj,tile.id,downPin)) return false;
        if(pinnedResource&&!resourceAllowed(profile,pinnedResource.kind,tile.id)) return false;
        return true;
      });
      if(!candidates.length) return null;
      ground[i]=pickWeighted(candidates,rng,left,up,Number(CFG.observe.sameNeighborWeight)||1);
    }
    return ground;
  }

  function fallbackTile(profile,biomeId,allowWater){
    var preferred=BASE_GROUND[biomeId];
    if(groundAllowed(profile,preferred,allowWater)) return preferred;
    for(var i=0;i<profile.tiles.length;i++) if(groundAllowed(profile,profile.tiles[i].id,allowWater)) return profile.tiles[i].id;
    return 'landing';
  }

  function fallbackGround(profile,biomeId,widthCells,heightCells,pins,allowWater){
    var ground=[],i,pinned=pinMap(pins,widthCells,heightCells);
    var base=fallbackTile(profile,biomeId,allowWater);
    for(i=0;i<widthCells*heightCells;i++) ground[i]=pinned[i]||base;
    return ground;
  }

  function sanitizeGround(ground,profile,biomeId,allowWater){
    var base=fallbackTile(profile,biomeId,allowWater);
    return ground.map(function(tile){return groundAllowed(profile,tile,allowWater)?tile:base;});
  }

  function applyGroundPins(ground,pins,widthCells,heightCells){
    var pinned=pinMap(pins,widthCells,heightCells),index;
    for(index in pinned) if(pinned.hasOwnProperty(index)) ground[+index]=pinned[index];
    return ground;
  }

  function hushDryShore(ground,profile){
    var semantics=CFG.observe.tileSemantics,wet=false,i,tile;
    for(i=0;i<ground.length;i++){
      tile=ground[i];
      if(semantics[tile]&&semantics[tile].water){wet=true;break;}
    }
    if(wet) return ground;
    var dryTile=profile.dryTile||profile.tiles[0].id;
    for(i=0;i<ground.length;i++){
      tile=ground[i];
      if(semantics[tile]&&semantics[tile].shore) ground[i]=dryTile;
    }
    return ground;
  }

  function cloneResources(resources){
    return resources.map(function(resource){
      var copy={},key;
      for(key in resource) if(resource.hasOwnProperty(key)) copy[key]=resource[key];
      return copy;
    });
  }

  function mergeResources(base,pins,widthCells,heightCells,profile){
    var byCell={},order=[],all=cloneResources(base||[]).concat(cloneResources(pins||[]));
    for(var i=0;i<all.length;i++){
      var resource=all[i];
      var semantics=resource&&CFG.observe.resourceSemantics&&CFG.observe.resourceSemantics[resource.kind];
      if(!resource||!semantics||!profile||!profile.resourceGround||!profile.resourceGround[resource.kind]||
        resource.gx!==(resource.gx|0)||resource.gy!==(resource.gy|0)||
        resource.gx<0||resource.gy<0||resource.gx>=widthCells||resource.gy>=heightCells) continue;
      resource.yieldItemId=semantics.yieldItemId;
      resource.amount=semantics.amount;
      var key=resource.gx+','+resource.gy;
      if(!byCell[key]) order.push(key);
      byCell[key]=resource;
    }
    return order.map(function(key){return byCell[key];});
  }

  function resourcesOnGround(resources,ground,profile,widthCells){
    return resources.filter(function(resource){
      return resourceAllowed(profile,resource.kind,ground[resource.gy*widthCells+resource.gx]);
    });
  }

  function observationOf(holder){
    return holder&&holder.observation?holder.observation:holder;
  }

  function tileAt(observation,gx,gy){
    observation=observationOf(observation);
    if(!observation) return null;
    var widthCells=observation.widthCells||(observation.grid&&observation.grid[0]&&observation.grid[0].length)||0;
    var heightCells=observation.heightCells||(observation.grid&&observation.grid.length)||0;
    if(gx<0||gy<0||gx>=widthCells||gy>=heightCells) return null;
    if(Array.isArray(observation.ground)) return observation.ground[gy*observation.widthCells+gx]||null;
    if(Array.isArray(observation.grid)&&Array.isArray(observation.grid[gy])) return observation.grid[gy][gx]||null;
    return null;
  }

  function cellAt(observation,gx,gy){
    var tile=tileAt(observation,gx,gy);
    if(!tile) return null;
    var semantics=CFG.observe&&CFG.observe.tileSemantics&&CFG.observe.tileSemantics[tile]||{};
    var water=semantics.water===true;
    return {
      tile:tile,
      region:tile,
      water:water,
      shore:semantics.shore===true,
      walkable:!water,
      buildable:!water,
      fertility:typeof semantics.fertility==='number'?semantics.fertility:0,
      moveCost:water?Infinity:(typeof semantics.moveCost==='number'?semantics.moveCost:1)
    };
  }

  function hasWater(observation){
    observation=observationOf(observation);
    if(!observation) return false;
    var count=positiveInt(observation.widthCells,0)*positiveInt(observation.heightCells,0);
    for(var i=0;i<count;i++){
      var tile=Array.isArray(observation.ground)?observation.ground[i]:null;
      if(tile&&CFG.observe.tileSemantics[tile]&&CFG.observe.tileSemantics[tile].water===true) return true;
    }
    if(Array.isArray(observation.grid)) for(var y=0;y<observation.grid.length;y++) for(var x=0;x<observation.grid[y].length;x++){
      var oldTile=observation.grid[y][x];
      if(CFG.observe.tileSemantics[oldTile]&&CFG.observe.tileSemantics[oldTile].water===true) return true;
    }
    return false;
  }

  function observe(opts){
    opts=opts||{};
    var biomeId=typeof opts.biomeId==='string'&&opts.biomeId?opts.biomeId:'biome_landing';
    var widthCells=positiveInt(opts.widthCells,1);
    var heightCells=positiveInt(opts.heightCells,1);
    var profile=CFG.observe&&CFG.observe.biomes&&CFG.observe.biomes[biomeId];
    var knownProfile=!!profile;
    profile=profile||(CFG.observe&&CFG.observe.biomes&&CFG.observe.biomes.biome_landing);
    var defaults=opts.home===true?homePins(widthCells,heightCells):{ground:[],resources:[]};
    var normalizedGroundPins=normalizeGroundPins(defaults.ground.concat(opts.groundPins||[]),knownProfile?profile:null,widthCells,heightCells,opts.allowWater);
    var groundPins=normalizedGroundPins.pins;
    var resourcePins=mergeResources(defaults.resources,opts.resourcePins||[],widthCells,heightCells,knownProfile?profile:null);
    var resources=resourcePins;
    var seed=opts.seed>>>0,retries=positiveInt(CFG.observe.retries,1),ground=null,rng,attempt;
    for(attempt=0;knownProfile&&!normalizedGroundPins.invalid&&attempt<retries&&!ground;attempt++){
      rng=U.makeRng((seed^Math.imul(attempt+1,CFG.observe.retrySalt>>>0))>>>0);
      ground=solve(profile,widthCells,heightCells,groundPins,resourcePins,opts.allowWater,rng);
    }
    var degraded=!ground;
    if(!ground){
      var fallback=typeof opts.fallback==='function'?opts.fallback({
        seed:seed,biomeId:biomeId,widthCells:widthCells,heightCells:heightCells,
        allowWater:opts.allowWater,groundPins:groundPins.slice(),resourcePins:resourcePins.slice()
      }):null;
      if(fallback&&Array.isArray(fallback.ground)&&fallback.ground.length===widthCells*heightCells){
        ground=sanitizeGround(fallback.ground.slice(),profile,biomeId,opts.allowWater);
        ground=applyGroundPins(ground,groundPins,widthCells,heightCells);
        resources=mergeResources(fallback.resources,resourcePins,widthCells,heightCells,knownProfile?profile:null);
      }else ground=fallbackGround(profile,biomeId,widthCells,heightCells,groundPins,opts.allowWater);
    }
    ground=hushDryShore(ground,profile);
    resources=resourcesOnGround(resources,ground,knownProfile?profile:null,widthCells);
    var result={
      v:1,
      widthCells:widthCells,
      heightCells:heightCells,
      biomeId:biomeId,
      degraded:degraded,
      ground:ground,
      resources:cloneResources(resources)
    };
    return result;
  }

  return {observe:observe,cellAt:cellAt,hasWater:hasWater};
})();
