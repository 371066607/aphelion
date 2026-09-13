/* ============================================================
   Aphelion · expedition_state.js — 双世界远征事务状态
   挂载: window.APH.ExpeditionState

   meta.residents 始终是唯一名册；worldId 只标记居民当前属于 home 或
   某个稳定 runId。远征状态与返航幂等凭据落在 colony.expedition。
   ============================================================ */
window.APH = window.APH || {};

APH.ExpeditionState = (function(){
  'use strict';
  var CFG=APH.CFG||{};
  var KINDS={resources:1,samples:1,relics:1};

  function clone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }
  function counts(src){
    var out={};
    Object.keys(src||{}).forEach(function(id){
      var n=Math.max(0,Math.floor(Number(src[id])||0));
      if(n>0) out[id]=n;
    });
    return out;
  }
  function ensureState(colony){
    if(!colony) return {v:1,sequence:1,active:null,settled:{}};
    var state=colony.expedition;
    if(!state||typeof state!=='object'||Array.isArray(state)) state=colony.expedition={};
    state.v=1;
    state.sequence=Math.max(1,Math.floor(Number(state.sequence)||1));
    if(!state.settled||typeof state.settled!=='object'||Array.isArray(state.settled)) state.settled={};
    if(state.active===undefined) state.active=null;
    var ids=Object.keys(state.settled);
    if(state.active&&state.active.id) ids.push(state.active.id);
    ids.forEach(function(id){
      var m=/^ex_(\d+)$/.exec(id||'');
      if(m) state.sequence=Math.max(state.sequence,Number(m[1])+1);
    });
    return state;
  }

  function item(id){ return (CFG.items||{})[id]||null; }
  function isRelic(id){ return id==='it_relic'||id==='it_ancient_core'||id==='it_ancient_blueprint'; }
  function matchesKind(kind,id){
    var it=item(id);
    if(!it) return false;
    if(kind==='samples') return !!it.isSpecimen || id.indexOf('specimen_')===0;
    if(kind==='relics') return isRelic(id);
    if(kind==='resources'){
      var bulk=(CFG.expedition&&CFG.expedition.bulkStores)||[];
      return id==='it_crystal_ore'||id==='it_mineral'||id==='it_alloy'||!!(it.store&&bulk.indexOf(it.store)>=0);
    }
    return false;
  }

  function objectiveFrom(kind){
    if(!KINDS[kind]) return {ok:false,why:'invalid-objective'};
    var cfg=CFG.expedition&&CFG.expedition.objectives&&CFG.expedition.objectives[kind];
    if(!cfg||!Array.isArray(cfg.itemIds)||!cfg.itemIds.length||!(Number(cfg.target)>0))
      return {ok:false,why:'invalid-objective'};
    var ids=[];
    cfg.itemIds.forEach(function(id){ if(ids.indexOf(id)<0&&matchesKind(kind,id)) ids.push(id); });
    if(!ids.length||ids.length!==cfg.itemIds.length) return {ok:false,why:'invalid-objective'};
    return {ok:true,objective:{kind:kind,itemIds:ids,target:Math.floor(Number(cfg.target)),progress:0,
      complete:false,reward:{source:'cargo',items:{}}}};
  }
  function objective(kind){
    var out=objectiveFrom(kind);
    return out.ok?clone(out.objective):null;
  }

  function eligibleMembers(meta){
    return (meta&&meta.residents||[]).filter(function(r){
      return r&&!r.dead&&!r.downed&&!r.medLying&&!(r.hp!=null&&r.hp<=0)&&(!r.worldId||r.worldId==='home');
    });
  }

  function supplyWorld(meta,colony,context){
    var world=context&&context.state?context.state:context;
    if(!world&&window.APH&&APH.state&&APH.state.colony===colony)world=APH.state;
    return {meta:meta,colony:colony,entities:(world&&world.entities)||[]};
  }

  function availableFood(meta,colony,context){
    if(colony&&colony.rulesVersion===1&&APH.Storage&&APH.Storage.availableFood)
      return APH.Storage.availableFood(supplyWorld(meta,colony,context));
    return Math.max(0,Number(meta&&meta.res&&meta.res.food)||0);
  }

  function validateSelection(meta, ids, supply, objectiveKind, colony, context){
    meta=meta||{}; ids=Array.isArray(ids)?ids:[]; supply=supply||{};
    var objective=objectiveFrom(objectiveKind);
    if(!objective.ok) return objective;
    var rawFood=supply.food==null?0:Number(supply.food);
    if(!Number.isFinite(rawFood)||rawFood<0||Math.floor(rawFood)!==rawFood)
      return {ok:false,why:'invalid-supply'};
    var food=rawFood;
    if(!ids.length) return {ok:false,why:'empty-squad'};
    var unique=[], members=[], roster=meta.residents||[];
    for(var i=0;i<ids.length;i++){
      var id=ids[i];
      if(!id||unique.indexOf(id)>=0) return {ok:false,why:'invalid-member',memberId:id};
      unique.push(id);
      var r=null;
      for(var j=0;j<roster.length;j++) if(roster[j]&&roster[j].id===id){r=roster[j];break;}
      if(!r) return {ok:false,why:'missing-member',memberId:id};
      if(r.dead||r.downed||r.medLying||(r.hp!=null&&r.hp<=0)) return {ok:false,why:'unfit-member',memberId:id};
      if(r.worldId&&r.worldId!=='home') return {ok:false,why:'member-away',memberId:id};
      members.push(r);
    }
    var have=availableFood(meta,colony,context);
    if(have<food) return {ok:false,why:'insufficient-food',need:food,have:have};
    return {ok:true,members:members,memberIds:unique,food:food,objective:objective.objective};
  }

  function active(colony){ return ensureState(colony).active; }

  function begin(meta, colony, ids, supply, objectiveKind, context){
    var state=ensureState(colony);
    if(state.active) return {ok:false,why:'active-run',run:state.active};
    var valid=validateSelection(meta,ids,supply,objectiveKind,colony,context);
    if(!valid.ok) return valid;
    var foodLots=[];
    if(colony&&colony.rulesVersion===1&&APH.Storage&&APH.Storage.takeFood){
      var taken=APH.Storage.takeFood(supplyWorld(meta,colony,context),valid.food);
      if(!taken.ok)return {ok:false,why:taken.why||'insufficient-food',need:valid.food,have:taken.have};
      foodLots=clone(taken.lots||[]);
    }else{
      meta.res=meta.res||{};
      meta.res.food=(meta.res.food||0)-valid.food;
      if(valid.food>0)foodLots=[{itemId:'it_food',n:valid.food}];
    }
    var runId='ex_'+(state.sequence++);
    var run={status:'active',id:runId,memberIds:valid.memberIds.slice(),
      roster:valid.members.map(clone),supply:{food:valid.food,foodLots:foodLots},cargo:{},runtime:{},
      objective:valid.objective};
    /* 所有校验完成后才扣补给并转移 world 归属，失败路径零副作用。 */
    valid.members.forEach(function(r){r.worldId=runId;});
    state.active=run;
    return {ok:true,run:run};
  }

  function runFor(colony,runId){
    var run=active(colony);
    return run&&run.id===runId?run:null;
  }
  function membersForWorld(meta,worldId){
    return (meta&&meta.residents||[]).filter(function(r){return r&&!r.dead&&(r.worldId||'home')===worldId;});
  }

  function refreshObjective(run){
    var obj=run&&run.objective;
    if(!obj) return null;
    var progress=0,reward={};
    (obj.itemIds||[]).forEach(function(id){
      var n=Math.max(0,Number(run.cargo&&run.cargo[id])||0);
      if(n){progress+=n;reward[id]=n;}
    });
    obj.progress=progress; obj.complete=progress>=obj.target;
    obj.reward={source:'cargo',items:reward};
    return obj;
  }

  function addCargo(colony,runId,itemId,n){
    var run=runFor(colony,runId), amount=Math.floor(Number(n)||0);
    if(!run) return {ok:false,why:'missing-run'};
    if(!item(itemId)) return {ok:false,why:'unknown-item',itemId:itemId};
    if(amount<=0) return {ok:false,why:'invalid-amount'};
    run.cargo[itemId]=(run.cargo[itemId]||0)+amount;
    return {ok:true,cargo:run.cargo,objective:refreshObjective(run)};
  }
  function setCargo(colony,runId,cargo){
    var run=runFor(colony,runId), next=counts(cargo);
    if(!run) return {ok:false,why:'missing-run'};
    var ids=Object.keys(next);
    for(var i=0;i<ids.length;i++) if(!item(ids[i])) return {ok:false,why:'unknown-item',itemId:ids[i]};
    run.cargo=next;
    return {ok:true,cargo:run.cargo,objective:refreshObjective(run)};
  }
  function objectiveState(colony,runId){
    var run=runFor(colony,runId);
    return run?clone(refreshObjective(run)):null;
  }
  function setRuntime(colony,runId,runtime){
    var run=runFor(colony,runId);
    if(!run) return {ok:false,why:'missing-run'};
    run.runtime=clone(runtime||{});
    return {ok:true,runtime:run.runtime};
  }

  function settlementOf(cargo,spot){
    var researchCargo={},drops=[],rejected=[];
    var packed=counts(cargo);
    Object.keys(packed).forEach(function(id){
      var n=packed[id];
      if(!item(id)){rejected.push(id);return;}
      if(id==='it_crystal_ore'||id==='it_relic') researchCargo[id]=n;
      else drops.push({itemId:id,n:n,x:spot.x,y:spot.y,stock:true});
    });
    var goods=(APH.Combat&&APH.Combat.settleGoods)?APH.Combat.settleGoods(researchCargo):{research:0};
    return {research:Math.max(0,Number(goods.research)||0),drops:drops,rejected:rejected};
  }

  function unusedFoodDrops(supply,spot){
    supply=supply||{};
    var remaining=Math.max(0,Math.floor(Number(supply.food)||0));
    if(!remaining)return [];
    var raw=Array.isArray(supply.foodLots)?supply.foodLots:null;
    if(!raw||!raw.length)return [{itemId:'it_food',n:remaining,x:spot.x,y:spot.y,stock:true}];
    var lots=[],total=0;
    raw.forEach(function(lot){
      var n=Math.max(0,Math.floor(Number(lot&&lot.n)||0));
      if(lot&&item(lot.itemId)&&n>0){lots.push({itemId:lot.itemId,n:n});total+=n;}
    });
    var consumed=Math.max(0,total-remaining),out=[];
    lots.forEach(function(lot){
      var used=Math.min(consumed,lot.n),left=lot.n-used;consumed-=used;
      if(left>0)out.push({itemId:lot.itemId,n:left,x:spot.x,y:spot.y,stock:true});
    });
    if(remaining>total)out.push({itemId:'it_food',n:remaining-total,x:spot.x,y:spot.y,stock:true});
    return out;
  }

  function sharedMemoryText(run){
    var kind=run&&run.objective&&run.objective.kind;
    if(kind==='samples')return '一起完成了一次标本远征';
    if(kind==='relics')return '一起完成了一次遗迹远征';
    return '一起完成了一次资源远征';
  }

  function returnHome(meta,colony,runId,dropSpot){
    var state=ensureState(colony), prior=state.settled[runId];
    if(prior) return {ok:true,alreadySettled:true,runId:runId,research:0,drops:[],receipt:clone(prior)};
    var run=state.active;
    if(!run||run.id!==runId) return {ok:false,why:'missing-run',alreadySettled:false,drops:[]};
    if(!dropSpot||!Number.isFinite(Number(dropSpot.x))||!Number.isFinite(Number(dropSpot.y)))
      return {ok:false,why:'missing-drop-spot',alreadySettled:false,drops:[]};
    var spot={x:Number(dropSpot.x),y:Number(dropSpot.y)};
    var settled=settlementOf(run.cargo,spot);
    settled.drops=settled.drops.concat(unusedFoodDrops(run.supply,spot));
    var objective=clone(refreshObjective(run));
    var receipt={runId:runId,memberIds:run.memberIds.slice(),supply:clone(run.supply),
      cargo:clone(run.cargo),objective:objective,research:settled.research,drops:clone(settled.drops)};
    state.settled[runId]=receipt;
    colony.pendingGround=(colony.pendingGround||[]).concat(clone(settled.drops));
    meta.research=(Number(meta.research)||0)+settled.research;
    if(APH.Res&&typeof APH.Res.rememberShared==='function'){
      try{APH.Res.rememberShared(meta,run.memberIds,{id:'expedition:'+runId,kind:'expedition',
        clock:Math.max(0,Number(run.runtime&&run.runtime.clock)||0),text:sharedMemoryText(run)});}catch(e){}
    }
    (meta.residents||[]).forEach(function(r){if(r&&run.memberIds.indexOf(r.id)>=0)r.worldId='home';});
    run.status='returned';
    state.active=null;
    return {ok:true,alreadySettled:false,runId:runId,research:settled.research,
      drops:clone(settled.drops),receipt:clone(receipt)};
  }

  function noteGuardianCleared(s){
    if(!s) return s;
    s.guardianCleared=true;
    return s;
  }
  function snapshot(colony){ return clone(ensureState(colony)); }
  function restore(meta,colony,snap){
    var raw=snap;
    try{if(typeof raw==='string')raw=JSON.parse(raw);}catch(e){return {ok:false,why:'invalid-snapshot'};}
    if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {ok:false,why:'invalid-snapshot'};
    colony.expedition=clone(raw);
    var state=ensureState(colony), run=state.active;
    if(run&&state.settled[run.id]){run.status='returned';state.active=null;run=null;}
    if(run){
      run.memberIds=Array.isArray(run.memberIds)?run.memberIds.slice():[];
      run.roster=Array.isArray(run.roster)?run.roster:[];
      run.cargo=counts(run.cargo);run.runtime=clone(run.runtime||{});
      var canonical=meta.residents||(meta.residents=[]);
      run.roster.forEach(function(saved){
        if(!saved||!saved.id||run.memberIds.indexOf(saved.id)<0)return;
        var found=null;
        for(var i=0;i<canonical.length;i++)if(canonical[i]&&canonical[i].id===saved.id){found=canonical[i];break;}
        if(!found){found=clone(saved);canonical.push(found);}
        found.worldId=run.id;
      });
      canonical.forEach(function(r){if(r&&run.memberIds.indexOf(r.id)>=0)r.worldId=run.id;});
      refreshObjective(run);
    }else{
      (meta.residents||[]).forEach(function(r){if(r&&/^ex_\d+$/.test(r.worldId||''))r.worldId='home';});
    }
    return {ok:true,state:state,run:state.active};
  }

  return {ensureState:ensureState,objective:objective,eligibleMembers:eligibleMembers,
    validateSelection:validateSelection,availableFood:availableFood,begin:begin,active:active,
    runFor:runFor,membersForWorld:membersForWorld,addCargo:addCargo,setCargo:setCargo,
    objectiveState:objectiveState,setRuntime:setRuntime,returnHome:returnHome,
    noteGuardianCleared:noteGuardianCleared,snapshot:snapshot,restore:restore};
})();
