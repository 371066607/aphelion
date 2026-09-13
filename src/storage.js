/* Physical storage for modern colonies.
   A stored stack remains one dropped entity; containerId is its sole owner. */
window.APH = window.APH || {};

APH.Storage = (function(){
  'use strict';
  var CFG=APH.CFG||{},T=CFG.entType||{};
  var LANDING_ID='landing_cargo';

  function stateOf(colony){
    var state=colony.storageState;
    if(!state||typeof state!=='object'||Array.isArray(state))state=colony.storageState={};
    state.v=1;
    state.nextPile=Math.max(1,Math.floor(Number(state.nextPile)||1));
    return state;
  }

  function buildingId(building){
    if(!building)return null;
    if(building.uid)return building.uid;
    return [(building.bid||building.id||'storage'),
      building.gx!=null?building.gx:building.x,
      building.gy!=null?building.gy:building.y].join('@');
  }

  function storageBuilding(building){
    var id=building&&(building.id||building.bid);
    return !!(building&&!building.dead&&(id==='bl_storage_shelf'||id==='bl_warehouse'));
  }

  function zoneAllows(zone,itemId){
    if(APH.Colony.zoneAllowsItem)return APH.Colony.zoneAllowsItem(zone,itemId);
    if(!zone||zone.type!=='stockpile')return false;
    return APH.Colony.storageFilterMatches(zone.filter,itemId);
  }

  function buildingFor(s,id){
    var list=(s&&s.colony&&s.colony.buildings)||[];
    for(var i=0;i<list.length;i++){
      if(storageBuilding(list[i])&&buildingId(list[i])===id)return list[i];
    }
    return null;
  }

  function zoneFor(s,id){
    var list=(s&&s.colony&&s.colony.zones)||[];
    for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id&&list[i].type==='stockpile')return list[i];
    return null;
  }

  function zoneHasCell(zone,x,y){
    var cells=(zone&&zone.cells)||[];
    for(var i=0;i<cells.length;i++){
      if(cells[i]&&cells[i].x===x&&cells[i].y===y)return true;
    }
    return false;
  }

  function isStored(entity,s){
    if(!entity||entity.dead||entity.type!==(T.DROPPED||'dropped')||!entity.itemId||!entity.containerId)return false;
    if(entity.containerId===LANDING_ID)return true;
    var building=buildingFor(s,entity.containerId);
    if(building)return APH.Colony.storageFilterMatches(building.filter,entity.itemId);
    var zone=zoneFor(s,entity.containerId);
    if(!zone||!zoneAllows(zone,entity.itemId))return false;
    var x=entity.storageX!=null?entity.storageX:entity.x;
    var y=entity.storageY!=null?entity.storageY:entity.y;
    return zoneHasCell(zone,x,y);
  }

  function landing(){
    var hab=CFG.HAB||{x:1100,y:1100};
    return {x:hab.x,y:hab.y+140,containerId:LANDING_ID,storageX:hab.x,storageY:hab.y+140};
  }

  function reachable(s,from,point){
    if(!from||s.colony.rulesVersion!==1||!window.APH.Nav||!APH.Nav.gridOf||!APH.Nav.astar)return true;
    var nav=APH.Nav.gridOf(s.colony.buildings||[],s.colony.scene);
    return !!APH.Nav.astar(nav,from,point);
  }

  function destination(s,itemId,from){
    if(!s||!s.colony||!itemId)return null;
    var buildings=s.colony.buildings||[],zones=s.colony.zones||[];
    var rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf(buildings,s.colony.scene):[];
    var raw=APH.Colony.findBestStorageSpot(itemId,buildings,rooms,from||null,zones);
    if(raw&&raw.zone){
      if(!zoneAllows(raw.zone,itemId))return null;
      if(!reachable(s,from,{x:raw.x,y:raw.y}))return null;
      return {x:raw.x,y:raw.y,containerId:raw.zone.id,storageX:raw.x,storageY:raw.y};
    }
    var building=raw&&raw.container;
    if(storageBuilding(building)&&APH.Colony.storageFilterMatches(building.filter,itemId)){
      var x=raw.x,y=raw.y;
      if(s.colony.rulesVersion===1&&building.geometryVersion===1){
        if(!APH.Construction||!APH.Construction.spot)return null;
        var spot=APH.Construction.spot(s,building,from||{x:building.x,y:building.y});
        if(!spot)return null;
        x=spot.x;y=spot.y;
      }
      return {x:x,y:y,containerId:buildingId(building),storageX:building.x,storageY:building.y};
    }
    var fallback=landing();
    return reachable(s,from,fallback)?fallback:null;
  }

  function destinationValid(s,itemId,dest){
    if(!dest||!dest.containerId)return false;
    if(dest.containerId===LANDING_ID)return true;
    var building=buildingFor(s,dest.containerId);
    if(building)return APH.Colony.storageFilterMatches(building.filter,itemId);
    var zone=zoneFor(s,dest.containerId);
    return !!(zone&&zoneAllows(zone,itemId)&&zoneHasCell(zone,dest.storageX,dest.storageY));
  }

  function nextId(s){
    var state=stateOf(s.colony),id;
    do{id='dp_store_'+(state.nextPile++);}while((s.entities||[]).some(function(e){return e&&e.id===id;}));
    return id;
  }

  function deposit(s,itemId,n,dest){
    n=Math.floor(Number(n)||0);
    if(!s||!s.colony||!itemId||n<=0)return {ok:false,why:'invalid-deposit'};
    if(s.colony.rulesVersion!==1){
      var legacy=APH.Colony.collectHome(s.meta,itemId,n);
      return {ok:legacy.kind!=='none',legacy:true,stored:legacy.kind==='none'?0:n,result:legacy};
    }
    if(!destinationValid(s,itemId,dest))return {ok:false,why:'invalid-destination'};
    prepare(s);
    var entities=s.entities||(s.entities=[]),found=null;
    for(var i=0;i<entities.length;i++){
      var entity=entities[i];
      if(entity&&!entity.dead&&entity.type===(T.DROPPED||'dropped')&&entity.itemId===itemId&&
        entity.containerId===dest.containerId&&isStored(entity,s)){found=entity;break;}
    }
    if(found){
      found.n=(found.n||1)+n;
      return {ok:true,stored:n,entity:found,merged:true};
    }
    var created={id:nextId(s),type:T.DROPPED||'dropped',x:dest.x,y:dest.y,itemId:itemId,n:n,
      bobA:0,stock:true,containerId:dest.containerId,storageX:dest.storageX,storageY:dest.storageY};
    entities.push(created);
    return {ok:true,stored:n,entity:created,merged:false};
  }

  function prepare(s){
    if(!s||!s.colony||s.colony.rulesVersion!==1)return {modern:false,released:[]};
    stateOf(s.colony);
    var released=[];
    (s.entities||[]).forEach(function(entity){
      if(!entity||!entity.containerId||isStored(entity,s))return;
      released.push(entity.id);
      delete entity.containerId;
      delete entity.storageX;
      delete entity.storageY;
    });
    return {modern:true,released:released};
  }

  function foodUnits(itemId){
    var def=(CFG.items&&CFG.items[itemId])||{};
    return def.store==='food' ? Math.max(1,Math.floor(Number(def.storeN)||1)) : 0;
  }

  function reservedFood(colony){
    var locked={stock:0,drops:{}},state=colony&&colony.logistics;
    ((state&&state.reservations)||[]).forEach(function(r){
      if(!r||r.phase!=='reserved'||!r.source)return;
      if(r.source.kind==='stock'&&(r.source.id==='stock:food'||r.key==='food'))
        locked.stock+=Math.max(0,Number(r.amount)||Number(r.source.itemCount)||0);
      else if(r.source.kind==='drop'&&r.source.id)
        locked.drops[r.source.id]=(locked.drops[r.source.id]||0)+Math.max(0,Number(r.source.itemCount)||0);
    });
    return locked;
  }

  function foodPlan(s,amount){
    amount=Math.floor(Number(amount)||0);
    if(!s||!s.colony||!s.meta||amount<0)return {ok:false,why:'invalid-supply',need:amount,have:0,sources:[],lots:[]};
    var locks=reservedFood(s.colony),sources=[],have=0;
    var stock=Math.max(0,Math.floor(Number(s.meta.res&&s.meta.res.food)||0)-locks.stock);
    if(stock>0){sources.push({kind:'stock',itemId:'it_food',available:stock});have+=stock;}
    (s.entities||[]).forEach(function(e){
      if(!e||e.dead||e.type!==(T.DROPPED||'dropped')||!e.itemId)return;
      var mul=foodUnits(e.itemId);if(!mul)return;
      var count=e.n==null?1:Math.max(0,Math.floor(Number(e.n)||0));
      var free=APH.Logistics&&APH.Logistics.availableDrop ? APH.Logistics.availableDrop(s.colony,e) :
        Math.max(0,count-(locks.drops[e.id]||0));
      if(!free)return;
      sources.push({kind:'entity',entity:e,itemId:e.itemId,available:free*mul,itemCount:free,unit:mul});
      have+=free*mul;
    });
    var remaining=amount,lots=[];
    sources.forEach(function(source){
      if(remaining<=0)return;
      /* 现有 CFG 所有 food 物品均为一件一份；拒绝拆一件多单位物品，避免凭空切物。 */
      var take=Math.min(remaining,source.available);
      if(source.kind==='entity'&&source.unit!==1)return;
      if(take>0){source.take=take;lots.push({itemId:source.itemId,n:take});remaining-=take;}
    });
    return {ok:remaining===0,why:remaining===0?null:'insufficient-food',need:amount,have:have,
      sources:sources,lots:lots};
  }

  function availableFood(s){ return foodPlan(s,0).have; }

  function takeFood(s,amount){
    var plan=foodPlan(s,amount);
    if(!plan.ok)return {ok:false,why:plan.why,need:plan.need,have:plan.have,lots:[]};
    plan.sources.forEach(function(source){
      var take=Math.max(0,source.take||0);if(!take)return;
      if(source.kind==='stock')s.meta.res.food=Math.max(0,(s.meta.res.food||0)-take);
      else{
        source.entity.n=Math.max(0,(source.entity.n==null?1:source.entity.n)-take);
        if(source.entity.n<=0)source.entity.dead=true;
      }
    });
    return {ok:true,taken:plan.need,have:plan.have,lots:plan.lots};
  }

  return {destination:destination,deposit:deposit,prepare:prepare,isStored:isStored,
    availableFood:availableFood,takeFood:takeFood};
})();
