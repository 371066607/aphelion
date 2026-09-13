/* Physical production inputs for modern colonies.
   Recipes remain owned by APH.Colony; APH.Logistics owns material location.
   This adapter binds one production unit to one logistics task. */
window.APH = window.APH || {};

APH.ProductionJobs = (function(){
  'use strict';
  var CFG=APH.CFG||{};

  function counts(src){
    var out={};
    Object.keys(src||{}).forEach(function(key){
      var n=Math.max(0,Math.floor(Number(src[key])||0));
      if(n>0)out[key]=n;
    });
    return out;
  }

  function uidOf(building){
    if(!building)return null;
    if(building.uid)return building.uid;
    return [(building.bid||building.id||'building'),
      building.gx!=null?building.gx:building.x,
      building.gy!=null?building.gy:building.y].join('@');
  }

  function stateOf(colony){
    var state=colony.productionJobs;
    if(!state||typeof state!=='object'||Array.isArray(state))state=colony.productionJobs={};
    state.v=1;
    if(!Array.isArray(state.bindings))state.bindings=[];
    if(typeof state.signature!=='string')state.signature='';
    return state;
  }

  function activeBill(building){
    return APH.Colony.activeBill ? APH.Colony.activeBill(building) : null;
  }

  function recipeSpec(s,building){
    var id=building&&(building.id||building.bid),bill=null,recipe=null,rec=null;
    if(id==='bl_wood_generator'){
      var fuelCfg=(CFG.power&&CFG.power.wood)||{};
      var refillAt=Math.max(0,Math.floor(Number(fuelCfg.refillAt)||0));
      var refillBatch=Math.max(1,Math.floor(Number(fuelCfg.refillBatch)||1));
      if((Math.max(0,Number(building.fuelWood)||0))>=refillAt)return null;
      return {mode:'fuel',recipe:'__wood_fuel__',job:'haul',need:{wood:refillBatch},bill:null};
    }
    if(id!=='bl_workshop'&&id!=='bl_kitchen'&&id!=='bl_campfire'&&id!=='bl_lab')return null;

    if(id==='bl_lab'){
      recipe=building.analysisTarget||'specimen_flora_glow';
      rec=APH.Colony.SPECIMEN_ANALYSIS&&APH.Colony.SPECIMEN_ANALYSIS[recipe];
      if(!rec)return null;
      var specimenNeed={};specimenNeed[recipe]=1;
      return {mode:'lab',recipe:recipe,job:'bl_lab',need:specimenNeed,bill:null,def:rec};
    }

    if(Array.isArray(building.bills)){
      bill=activeBill(building);
      if(!bill){
        if(id==='bl_workshop'&&building.bills.length===0&&!building.recipe)
          return {mode:'medicine',recipe:'__medicine__',job:'bl_workshop',
            need:{mineral:((CFG.workshop&&CFG.workshop.mineralCost)!=null)?CFG.workshop.mineralCost:2},
            bill:null};
        return null;
      }
      recipe=bill.recipe;
    }else recipe=building.recipe;

    if(id==='bl_workshop'){
      rec=recipe&&APH.Colony.CRAFT_RECIPES&&APH.Colony.CRAFT_RECIPES[recipe];
      if(!rec){
        /* The pre-recipe workshop produces medicine each production tick. */
        if(Array.isArray(building.bills))return null;
        return {mode:'medicine',recipe:'__medicine__',job:'bl_workshop',
          need:{mineral:((CFG.workshop&&CFG.workshop.mineralCost)!=null)?CFG.workshop.mineralCost:2},
          bill:null};
      }
      if(rec.reqTech&&!(s.meta.tech||{})[rec.reqTech])return null;
      return {mode:'craft',recipe:recipe,job:'bl_workshop',need:counts(rec.costRes),bill:bill,def:rec};
    }

    recipe=recipe||'it_roasted_meat';
    rec=APH.Colony.COOK_RECIPES&&APH.Colony.COOK_RECIPES[recipe];
    if(!rec)return null;
    var allowed=rec.bldgs||rec.bldg||['bl_kitchen','bl_campfire'];
    if(allowed.indexOf(id)<0)return null;
    if(rec.reqTech&&!(s.meta.tech||{})[rec.reqTech])return null;
    return {mode:'cook',recipe:recipe,job:'bl_kitchen',need:counts(rec.costRes),bill:bill,def:rec};
  }

  function tokenOf(spec){
    var bill=spec.bill;
    return spec.mode+'|'+spec.recipe+'|'+(bill?(bill.id+'|'+(bill.done||0)+'|'+(bill.target||0)):'repeat');
  }

  function desiredOf(s){
    var desired=[];
    (s.colony.buildings||[]).forEach(function(building){
      if(!building||building.dead)return;
      var spec=recipeSpec(s,building);
      if(!spec)return;
      spec.building=building;
      spec.uid=uidOf(building);
      spec.token=tokenOf(spec);
      desired.push(spec);
    });
    return desired;
  }

  function signatureOf(desired){
    return desired.map(function(d){
      return d.uid+'#'+d.token+'#'+d.building.x+','+d.building.y+'#'+JSON.stringify(d.need);
    }).sort().join(';');
  }

  function addPending(colony,drops){
    if(!drops||!drops.length)return;
    colony.pendingGround=(colony.pendingGround||[]).concat(drops);
  }

  function resetProgress(building){
    if(!building)return;
    building.craftProgress=0;
    building.cookProgress=0;
    building.analysisProgress=0;
  }

  function bindingValid(s,binding){
    if(!binding)return false;
    var building=(s.colony.buildings||[]).find(function(b){return uidOf(b)===binding.buildingUid&&!b.dead;});
    var task=APH.Logistics.taskFor(s.colony,binding.taskId);
    return !!(building&&task&&task.kind==='production'&&task.productionJob===true&&
      task.productionToken===binding.token&&task.currentRecipe===binding.recipe&&
      JSON.stringify(counts(task.need))===binding.needKey&&building.productionTaskId===task.id);
  }

  /* 燃料送齐就直接转进发电机机仓，不需要工人在工位加工。 */
  function refuel(s){
    if(!s||!s.colony||s.colony.rulesVersion!==1)return {modern:false,changed:false,refueled:0};
    var changed=false,refueled=0;
    (s.colony.buildings||[]).forEach(function(building){
      if(!building||building.dead||(building.id||building.bid)!=='bl_wood_generator')return;
      var task=building.productionTaskId&&APH.Logistics.taskFor(s.colony,building.productionTaskId);
      if(!task||task.productionMode!=='fuel'||!APH.Logistics.taskState(s.colony,task).ready)return;
      var completed=APH.Logistics.completeTask(s.colony,task);
      if(!completed.ok)return;
      var added=Math.max(0,Number(completed.consumed&&completed.consumed.wood)||0);
      building.fuelWood=Math.max(0,Number(building.fuelWood)||0)+added;
      addPending(s.colony,completed.drops);
      building.productionTaskId=null;building.productionRecipe=null;
      changed=true;refueled+=added;
    });
    if(changed)stateOf(s.colony).signature='';
    return {modern:true,changed:changed,refueled:refueled};
  }

  function prepare(s){
    if(!s||!s.colony||s.colony.rulesVersion!==1)return {modern:false,changed:false,targets:[]};
    refuel(s);
    var jobs=stateOf(s.colony),desired=desiredOf(s),signature=signatureOf(desired);
    var ownedTasks=APH.Logistics.ensureState(s.colony).tasks.filter(function(task){
      return task&&task.kind==='production'&&task.productionJob===true;
    });
    if(jobs.signature===signature&&jobs.bindings.length===desired.length&&ownedTasks.length===jobs.bindings.length&&
      jobs.bindings.every(function(b){return bindingValid(s,b);}))
      return {modern:true,changed:false,targets:targets(s,true)};

    var wanted={};
    desired.forEach(function(d){wanted[d.uid]=d;});
    var cancelled=[];
    APH.Logistics.ensureState(s.colony).tasks.slice().forEach(function(task){
      if(!task||task.kind!=='production'||task.productionJob!==true)return;
      var d=wanted[task.targetId];
      if(d&&task.productionToken===d.token)return;
      var out=APH.Logistics.cancelTask(s.colony,task);
      addPending(s.colony,out.drops);
      cancelled.push(task.id);
      var old=(s.colony.buildings||[]).find(function(b){return uidOf(b)===task.targetId;});
      if(old){old.productionTaskId=null;old.productionRecipe=null;resetProgress(old);}
    });

    var bindings=[];
    desired.forEach(function(d){
      var building=d.building;
      var prior=building.productionTaskId&&APH.Logistics.taskFor(s.colony,building.productionTaskId);
      if(prior&&prior.productionToken!==d.token){
        var old=APH.Logistics.cancelTask(s.colony,prior);
        addPending(s.colony,old.drops);cancelled.push(prior.id);resetProgress(building);prior=null;
      }
      var spot=(APH.Construction&&APH.Construction.spot)?APH.Construction.spot(s,building,{x:building.x,y:building.y}):null;
      var task=prior||APH.Logistics.ensureTask(s.colony,{kind:'production',targetId:d.uid,
        x:building.x,y:building.y,deliverySpot:spot,need:d.need});
      task.kind='production';task.productionJob=true;task.productionMode=d.mode;
      task.currentRecipe=d.recipe;task.productionToken=d.token;task.need=counts(d.need);
      if(spot)task.deliverySpot={x:spot.x,y:spot.y};
      building.productionTaskId=task.id;building.productionRecipe=d.recipe;
      if(d.mode!=='medicine')building.recipe=d.recipe;
      bindings.push({buildingUid:d.uid,taskId:task.id,job:d.job,token:d.token,
        recipe:d.recipe,needKey:JSON.stringify(counts(d.need))});
    });
    jobs.signature=signature;jobs.bindings=bindings;
    return {modern:true,changed:true,cancelled:cancelled,targets:targets(s,true)};
  }

  function targets(s,skipPrepare){
    if(!s||!s.colony||s.colony.rulesVersion!==1)return [];
    if(!skipPrepare)prepare(s);
    var jobs=stateOf(s.colony),out=[];
    jobs.bindings.forEach(function(binding){
      var building=(s.colony.buildings||[]).find(function(b){return uidOf(b)===binding.buildingUid&&!b.dead;});
      var task=APH.Logistics.taskFor(s.colony,binding.taskId);
      if(building&&task)out.push({building:building,task:task,job:binding.job});
    });
    return out;
  }

  function medicineOutput(building,skill,eff){
    var cfg=CFG.workshop||{},base=cfg.medGain!=null?cfg.medGain:1;
    return Math.max(1,Math.round(base*(1+(skill||0)*0.15)*(eff==null?1:eff)*(building.lv||1)));
  }

  function tick(s,building,skill,eff,dt){
    if(!s||!building||!s.colony||s.colony.rulesVersion!==1)return {done:false,why:'legacy'};
    prepare(s);
    var task=building.productionTaskId&&APH.Logistics.taskFor(s.colony,building.productionTaskId);
    if(!task){building.workReason='无生产任务';return {done:false,why:building.workReason};}
    var state=APH.Logistics.taskState(s.colony,task);
    if(!state.ready){building.workReason='材料未送达';return {done:false,why:building.workReason,missing:state.missing,taskId:task.id};}
    building.workReason='加工中';

    var local=counts(state.delivered),out;
    if(task.productionMode==='craft')
      out=APH.Colony.workshopCraftTick(building,skill,eff,local,s.meta.tech,dt);
    else if(task.productionMode==='cook')
      out=APH.Colony.cookingTick(building,skill,eff,local,s.meta.tech,dt);
    else if(task.productionMode==='lab')
      out=APH.Colony.labAnalysisTick(building,skill,eff,local,dt);
    else if(task.productionMode==='medicine')
      {
        var med=medicineOutput(building,skill,eff);
        out={done:true,producedItemId:'it_med',count:med,med:med};
      }
    else return {done:false,why:'未知生产任务'};

    out=out||{done:false};out.taskId=task.id;
    if(!out.done)return out;
    var completed=APH.Logistics.completeTask(s.colony,task);
    if(!completed.ok)return {done:false,why:completed.why||'材料结算失败',taskId:task.id};
    addPending(s.colony,completed.drops);
    building.productionTaskId=null;building.productionRecipe=null;
    stateOf(s.colony).signature='';
    out.materials=completed;
    return out;
  }

  return {prepare:prepare,targets:targets,tick:tick,refuel:refuel,uidOf:uidOf};
})();
