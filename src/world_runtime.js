/* Transitional two-world runtime adapter.
   It keeps the active APH.state object stable while home and expedition own
   separate mutable world containers. Systems still reading APH.state can be
   run against an inactive world only through the synchronous run() seam. */
window.APH = window.APH || {};

APH.WorldRuntime = (function(){
  'use strict';

  var GLOBAL_KEYS = {
    clock:1, paused:1, timeScale:1, mode:1, keys:1, joy:1, worlds:1
  };
  var MANAGER_KEYS = { worlds:1, _background:1 };
  var ENTITY_TRANSIENT = {
    def:1, path:1, pathGoal:1, pathRevision:1, cache:1, _cache:1,
    sprite:1, sheet:1, image:1, ctx:1
  };
  var ORDER_REFS = ['enemy','flora','pile','entity','target'];
  var GROUP_FIELDS = { group:1, selectedPawns:1 };
  var WORLD_FIELDS = [
    'scene','worldDescriptor','spec','specSaved','seed','lastExpedition','landedAt',
    'px','py','vx','vy','face','walkPh','moving','run','downed','o2','hp','cry',
    'found','totalBeacons','carry','runLoot','squad','group','selectedPawns',
    'selectedRid','selectedTarget','playerDrafted','entities','parts','spores',
    'ruins','war','rivalStates','power','floraRespawn','expeditionRegenT','overlayFailures','designations',
    'orderTool','orderDrag','orderFrom','orderTo','pawnDrag','pawnDragStart',
    'pawnDragEnd','fireCd','iFrameT','hurtFlash','noiseT','acidT','spawnT','prodT',
    'camX','camY','camZoom','camFollow','strictCam','shake','target','nearBeacon','nearPad',
    'nearBed','nearFood','nearFlora','nearVisitor','nearBrokenResident','scanning',
    'scanT','buildMode','buildRotation','techSel','partsT','openingClock',
    'openingAlarmT','bossEverSpawned','guardianCleared','runStartedAt','_worldReady',
    '_stormOn','_acidOn','nav','navGrid','navCache','pathCache','tasks','task',
    'squadNeedT','settledLoot','clinicKit','gathering','socialCooldowns',
    '_expeditionReturn','debugKeys','debugMark','showMarker','devFreeBuild','resSel','tradeSel'
  ];

  function own(obj, key){ return Object.prototype.hasOwnProperty.call(obj, key); }
  function normalizedExpeditionRegenT(value){
    var period=Number(APH.CFG&&APH.CFG.time&&APH.CFG.time.prodTick)||30;
    if(!(period>0)||!isFinite(period)||typeof value!=='number'||!isFinite(value)||value<0)return 0;
    return value%period;
  }

  /* Deliberately shallow: a captured world keeps ownership of its live entity
     objects and caches while the facade is switched to another world. */
  function capture(state){
    var out = {};
    Object.keys(state || {}).forEach(function(key){
      if(!MANAGER_KEYS[key]) out[key] = state[key];
    });
    return out;
  }

  function install(target, world){
    if(!target || !world) throw new Error('WorldRuntime.install requires target and world');
    var source = target === world ? capture(world) : world;
    Object.keys(target).forEach(function(key){
      if(!GLOBAL_KEYS[key]) delete target[key];
    });
    Object.keys(source).forEach(function(key){
      if(!GLOBAL_KEYS[key] && !MANAGER_KEYS[key]) target[key] = source[key];
    });
    return target;
  }

  function run(world, fn){
    if(!world || typeof fn !== 'function') throw new Error('WorldRuntime.run requires world and fn');
    var previous = APH.state;
    var hadBackground = own(world, '_background');
    var previousBackground = world._background;
    world._background = true;
    APH.state = world;
    try{
      var value = fn(world);
      if(value && typeof value.then === 'function')
        throw new Error('WorldRuntime.run callback must be synchronous');
      return value;
    } finally {
      APH.state = previous;
      if(hadBackground) world._background = previousBackground;
      else delete world._background;
    }
  }

  function plainClone(value, seen){
    if(value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if(typeof value === 'function') return undefined;
    if(typeof value !== 'object') return undefined;
    seen = seen || [];
    if(seen.indexOf(value) >= 0) return undefined;
    seen.push(value);
    var out, i, v;
    if(Array.isArray(value)){
      out = [];
      for(i=0;i<value.length;i++){
        v = plainClone(value[i], seen);
        if(v !== undefined) out.push(v);
      }
    }else{
      out = {};
      Object.keys(value).forEach(function(key){
        var next = plainClone(value[key], seen);
        if(next !== undefined) out[key] = next;
      });
    }
    seen.pop();
    return out;
  }

  function entityId(entity){
    return entity && (entity.id != null ? entity.id : entity.uid != null ? entity.uid : entity.rid);
  }

  function encodeOrder(order){
    if(!order || typeof order !== 'object') return plainClone(order);
    var out = {};
    Object.keys(order).forEach(function(key){
      if(ORDER_REFS.indexOf(key) >= 0 && order[key] && typeof order[key] === 'object'){
        var id = entityId(order[key]);
        if(id != null) out[key+'Id'] = id;
        return;
      }
      var value = plainClone(order[key]);
      if(value !== undefined) out[key] = value;
    });
    return out;
  }

  function encodeEntity(entity){
    var out = {};
    Object.keys(entity || {}).forEach(function(key){
      if(ENTITY_TRANSIENT[key]) return;
      if(key === 'userOrder'){
        var order = encodeOrder(entity.userOrder);
        if(order !== undefined) out.userOrder = order;
        return;
      }
      var value = plainClone(entity[key]);
      if(value !== undefined) out[key] = value;
    });
    return out;
  }

  function encodeGroup(group){
    if(!Array.isArray(group)) return plainClone(group);
    return group.map(function(item){
      var id = entityId(item);
      return id != null ? id : plainClone(item);
    });
  }

  function encodeSelectedTarget(target){
    if(!target || typeof target !== 'object') return plainClone(target);
    var out = {};
    Object.keys(target).forEach(function(key){
      if(key === 'entity' && target.entity && typeof target.entity === 'object'){
        var id = entityId(target.entity);
        if(id != null) out.entityId = id;
        return;
      }
      var value = plainClone(target[key]);
      if(value !== undefined) out[key] = value;
    });
    return out;
  }

  function serializable(world){
    var out = { runtimeVersion:1 };
    WORLD_FIELDS.forEach(function(key){
      if(!own(world || {}, key)) return;
      if(key === 'entities') out.entities = (world.entities || []).map(encodeEntity);
      else if(GROUP_FIELDS[key]) out[key] = encodeGroup(world[key]);
      else if(key === 'selectedTarget') out.selectedTarget = encodeSelectedTarget(world.selectedTarget);
      else if((key === 'scanning' || key === 'nearBeacon') && world[key] && typeof world[key] === 'object'){
        var id = entityId(world[key]);
        if(id != null) out[key+'Id'] = id;
      }
      else if(key==='expeditionRegenT') out[key]=normalizedExpeditionRegenT(world[key]);
      else {
        var value = plainClone(world[key]);
        if(value !== undefined) out[key] = value;
      }
    });
    return out;
  }

  function decodeOrder(order, byId){
    if(!order || typeof order !== 'object') return order;
    ORDER_REFS.forEach(function(key){
      var idKey = key+'Id';
      if(own(order,idKey) && own(byId,String(order[idKey]))) order[key] = byId[String(order[idKey])];
    });
    return order;
  }

  function restore(snapshot, base){
    /* meta/colony are canonical outer saves. Older runtime snapshots may still
       contain mirrors; never let those stale copies replace the supplied base. */
    var clean = {};
    Object.keys(snapshot || {}).forEach(function(key){
      if(key === 'meta' || key === 'colony') return;
      var value = plainClone(snapshot[key]);
      if(value !== undefined) clean[key] = value;
    });
    var world = Object.assign({}, base || {}, clean);
    if(base && own(base,'meta')) world.meta = base.meta;
    else delete world.meta;
    if(base && own(base,'colony')) world.colony = base.colony;
    else delete world.colony;
    delete world.runtimeVersion;
    if(own(world,'expeditionRegenT'))world.expeditionRegenT=normalizedExpeditionRegenT(world.expeditionRegenT);
    var entities = Array.isArray(world.entities) ? world.entities : [];
    var byId = {};
    entities.forEach(function(entity){
      var id = entityId(entity);
      if(id != null) byId[String(id)] = entity;
    });
    entities.forEach(function(entity){
      var bid=entity&&entity.bid;
      var def=bid&&window.APH.Colony&&APH.Colony.get?APH.Colony.get(bid):null;
      if(def)entity.def=def;
      if(entity.userOrder) entity.userOrder = decodeOrder(entity.userOrder, byId);
    });
    if(own(world,'scanningId')){
      world.scanning = byId[String(world.scanningId)] || null;
      delete world.scanningId;
    }
    if(own(world,'nearBeaconId')){
      world.nearBeacon = byId[String(world.nearBeaconId)] || null;
      delete world.nearBeaconId;
    }
    if(world.selectedTarget && own(world.selectedTarget,'entityId')){
      world.selectedTarget.entity = byId[String(world.selectedTarget.entityId)] || null;
      delete world.selectedTarget.entityId;
    }
    Object.keys(GROUP_FIELDS).forEach(function(key){
      if(!Array.isArray(world[key])) return;
      world[key] = world[key].map(function(item){
        return own(byId,String(item)) ? byId[String(item)] : item;
      });
    });
    if(world.ruins){
      entities.forEach(function(entity){
        if(entity.bid === 'ancient_gate' && world.ruins.gate) entity.gate = world.ruins.gate;
        else if(entity.bid === 'ancient_terminal' && world.ruins.terminal) entity.terminal = world.ruins.terminal;
        else if(entity.bid === 'ancient_vault' && world.ruins.vault) entity.vault = world.ruins.vault;
      });
    }
    return world;
  }

  function cloneSlot(world){
    var out = capture(world || {});
    if(Array.isArray(out.entities)){
      var snap = serializable({entities:out.entities,group:out.group,selectedPawns:out.selectedPawns});
      var restored = restore(snap);
      out.entities = restored.entities;
      if(own(out,'group')) out.group = restored.group;
      if(own(out,'selectedPawns')) out.selectedPawns = restored.selectedPawns;
    }else out.entities = [];
    ['parts','spores','tasks'].forEach(function(key){
      if(Array.isArray(out[key])) out[key] = plainClone(out[key]);
    });
    /* These are mutable world-owned records. meta/colony stay shared canonical
       outer state; runtime snapshots never duplicate either object graph. */
    ['carry','scene','spec','war','rivalStates','power','ruins',
      'floraRespawn','overlayFailures','designations','runLoot','nav','navGrid','navCache','pathCache','task'].forEach(function(key){
      if(out[key] && typeof out[key] === 'object') out[key] = plainClone(out[key]);
    });
    return out;
  }

  function freshWorld(name){
    return { scene:name, entities:[], parts:[], spores:[], carry:{} };
  }

  function createManager(target, seeds){
    target = target || APH.state;
    if(!target) throw new Error('WorldRuntime.createManager requires a state facade');
    seeds = seeds || {};
    var active = target.scene === 'expedition' ? 'expedition' : 'home';
    var worlds = {
      home: seeds.home ? cloneSlot(seeds.home) : null,
      expedition: seeds.expedition ? cloneSlot(seeds.expedition) : null
    };
    if(worlds[active]) install(target, worlds[active]);
    else worlds[active] = capture(target);
    target.worlds = worlds;

    function assertName(name){
      if(name !== 'home' && name !== 'expedition') throw new Error('Unknown world: '+name);
    }
    function stash(){
      worlds[active] = capture(target);
      target.worlds = worlds;
      return worlds[active];
    }
    function set(name, world){
      assertName(name);
      worlds[name] = cloneSlot(world || freshWorld(name));
      target.worlds = worlds;
      return worlds[name];
    }
    function activate(name, world){
      assertName(name);
      stash();
      if(world) set(name, world);
      if(!worlds[name]) worlds[name] = freshWorld(name);
      install(target, worlds[name]);
      target.scene = name;
      target.worlds = worlds;
      active = name;
      return target;
    }
    function background(name, fn){
      assertName(name);
      if(name === active) throw new Error('Active world is not a background world');
      if(!worlds[name]) worlds[name] = freshWorld(name);
      return run(worlds[name], fn);
    }
    return {
      worlds:worlds,
      active:function(){ return active; },
      get:function(name){ assertName(name); return worlds[name]; },
      set:set,
      stash:stash,
      activate:activate,
      run:background
    };
  }

  return {
    capture:capture,
    install:install,
    run:run,
    serializable:serializable,
    restore:restore,
    createManager:createManager
  };
})();
