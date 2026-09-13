/* ============================================================
   Aphelion · logistics.js — 实物物流所有权与预订
   挂载: window.APH.Logistics

   物资在任一时刻只属于一个位置: 仓储数字池 / 地上堆 / 在途货物 /
   工地已送达材料。预订只锁来源, pickup 才转移所有权, deliver 才进工地。
   ============================================================ */
window.APH = window.APH || {};

APH.Logistics = (function(){
  'use strict';
  var CFG = APH.CFG || {};
  var T = CFG.entType || {};

  function copyCounts(src){
    var out = {}, k;
    src = src || {};
    for(k in src){
      var n = Math.max(0, Number(src[k]) || 0);
      if(n > 0) out[k] = n;
    }
    return out;
  }

  function ensureState(colony){
    if(!colony) return { v:1, nextTask:1, nextReservation:1, tasks:[], reservations:[] };
    var s = colony.logistics;
    if(!s || typeof s !== 'object') s = colony.logistics = {};
    /* 兼容正式接线前短暂出现过的 object-map 草案，不能因为形状不同静默吞任务。 */
    if(!Array.isArray(s.tasks) && s.jobs && typeof s.jobs==='object')
      s.tasks = Object.keys(s.jobs).map(function(k){ return s.jobs[k]; }).filter(Boolean);
    if(!Array.isArray(s.reservations) && s.reservations && typeof s.reservations==='object')
      s.reservations = Object.keys(s.reservations).map(function(k){ return s.reservations[k]; }).filter(Boolean);
    s.v = 1;
    s.nextTask = Math.max(1, s.nextTask || s.nextId || 1);
    s.nextReservation = Math.max(1, s.nextReservation || s.nextId || 1);
    if(!Array.isArray(s.tasks)) s.tasks = [];
    if(!Array.isArray(s.reservations)) s.reservations = [];
    /* 老档或中间版本可能带着比现有 ID 更小的计数器。继续自增会撞 ID，
       然后 taskFor() 取到别人的任务，直接造成重复扣料或吞料。 */
    s.tasks.forEach(function(task){
      var m=task&&/^lt_(\d+)$/.exec(task.id||'');
      if(m) s.nextTask=Math.max(s.nextTask,Number(m[1])+1);
    });
    s.reservations.forEach(function(r){
      var m=r&&/^lr_(\d+)$/.exec(r.id||'');
      if(m) s.nextReservation=Math.max(s.nextReservation,Number(m[1])+1);
    });
    s.tasks.forEach(function(task){
      task.need = copyCounts(task.need);
      if(!Array.isArray(task.deliveredLots)) task.deliveredLots = [];
    });
    return s;
  }

  function taskFor(colony, id){
    var s = ensureState(colony);
    for(var i=0;i<s.tasks.length;i++) if(s.tasks[i] && s.tasks[i].id===id) return s.tasks[i];
    return null;
  }

  function taskForTarget(colony, kind, targetId){
    var s = ensureState(colony);
    for(var i=0;i<s.tasks.length;i++){
      var task=s.tasks[i];
      if(task && task.kind===kind && task.targetId===targetId) return task;
    }
    return null;
  }

  function ensureTask(colony, spec){
    spec = spec || {};
    var s = ensureState(colony);
    var task = spec.id ? taskFor(colony, spec.id) : null;
    if(!task && spec.kind && spec.targetId) task = taskForTarget(colony, spec.kind, spec.targetId);
    if(task){
      if(spec.x != null) task.x = spec.x;
      if(spec.y != null) task.y = spec.y;
      if(spec.deliverySpot) task.deliverySpot = {x:spec.deliverySpot.x,y:spec.deliverySpot.y};
      if(spec.need) task.need = copyCounts(spec.need);
      return task;
    }
    var id = spec.id || ('lt_' + (s.nextTask++));
    task = {
      id:id,
      kind:spec.kind || 'generic',
      targetId:spec.targetId || id,
      x:spec.x || 0,
      y:spec.y || 0,
      deliverySpot:spec.deliverySpot ? {x:spec.deliverySpot.x,y:spec.deliverySpot.y} : null,
      need:copyCounts(spec.need),
      deliveredLots:[]
    };
    s.tasks.push(task);
    return task;
  }

  function lotUnits(lot){ return Math.max(0, Number(lot && lot.amount) || 0); }

  function deliveredOf(task, key){
    var n=0;
    ((task && task.deliveredLots)||[]).forEach(function(lot){
      if(lot && lot.key===key) n += lotUnits(lot);
    });
    return n;
  }

  function reservedOf(colony, taskId, key){
    var n=0, s=ensureState(colony);
    s.reservations.forEach(function(r){
      if(r && r.taskId===taskId && r.key===key) n += Math.max(0, Number(r.amount)||0);
    });
    return n;
  }

  function taskState(colony, taskOrId){
    var task = typeof taskOrId==='string' ? taskFor(colony, taskOrId) : taskOrId;
    if(!task) return { status:'missing-task', ready:false, missing:{} };
    var missing={}, reserved={}, delivered={}, anyMove=false, ready=true;
    Object.keys(task.need||{}).forEach(function(key){
      var need=task.need[key]||0;
      var got=deliveredOf(task,key);
      var held=reservedOf(colony,task.id,key);
      delivered[key]=got; reserved[key]=held;
      var left=Math.max(0,need-got-held);
      if(left>0) missing[key]=left;
      if(got<need) ready=false;
      if(got>0||held>0) anyMove=true;
    });
    return { status:ready?'ready':(anyMove?'hauling':'missing'), ready:ready,
      missing:missing, reserved:reserved, delivered:delivered };
  }

  function itemInfo(itemId){ return (CFG.items && CFG.items[itemId]) || {}; }
  function requirementUnits(itemId, key){
    if(itemId===key || itemId==='it_'+key) return 1;
    var it=itemInfo(itemId);
    return it.store===key ? (it.storeN||1) : 0;
  }
  function itemIdForKey(key){
    if(CFG.items && CFG.items[key]) return key;
    if(CFG.items && CFG.items['it_'+key]) return 'it_'+key;
    var ids=Object.keys(CFG.items||{});
    for(var i=0;i<ids.length;i++){
      var it=CFG.items[ids[i]];
      if(it && it.store===key && (it.storeN||1)===1) return ids[i];
    }
    return key.indexOf('it_')===0 ? key : 'it_'+key;
  }

  function sourceReserved(s, sourceKind, sourceId, key){
    var n=0;
    s.reservations.forEach(function(r){
      if(!r || r.phase!=='reserved' || !r.source || (sourceKind!=='drop'&&r.key!==key)) return;
      if(r.source.kind===sourceKind && r.source.id===sourceId) n += r.source.itemCount||r.amount||0;
    });
    return n;
  }

  function availableDrop(colony, entity){
    if(!entity||entity.dead||entity.type!==(T.DROPPED||'dropped'))return 0;
    return Math.max(0,(entity.n||1)-sourceReserved(ensureState(colony),'drop',entity.id,null));
  }

  function available(colony, stock, entities, key){
    var s=ensureState(colony), total=0;
    var stockN=Math.max(0,Number(stock&&stock[key])||0);
    total += Math.max(0,stockN-sourceReserved(s,'stock','stock:'+key,key));
    (entities||[]).forEach(function(e){
      if(!e||e.dead||e.type!==(T.DROPPED||'dropped')||!e.itemId) return;
      var mul=requirementUnits(e.itemId,key);
      if(!mul) return;
      var freeItems=Math.max(0,(e.n||1)-sourceReserved(s,'drop',e.id,key));
      total += freeItems*mul;
    });
    return total;
  }

  function inventoryOf(colony, stock, entities){
    var keys={}, out={}, k;
    for(k in (stock||{})) keys[k]=1;
    (entities||[]).forEach(function(e){
      if(!e||e.dead||e.type!==(T.DROPPED||'dropped')||!e.itemId) return;
      keys[e.itemId]=1;
      var it=itemInfo(e.itemId); if(it.store) keys[it.store]=1;
    });
    ensureState(colony).tasks.forEach(function(task){ for(k in (task.need||{})) keys[k]=1; });
    for(k in keys) out[k]=available(colony,stock,entities,k);
    return out;
  }

  function dist(a,b){
    var dx=(a.x||0)-(b.x||0), dy=(a.y||0)-(b.y||0);
    return Math.sqrt(dx*dx+dy*dy);
  }
  function logisticsCfg(){ return CFG.logistics || CFG.haul || {}; }

  function carryWeightLimit(opts){
    var configured=Number(logisticsCfg().carryWeight);
    var cap=configured>0?configured:Infinity;
    if(opts&&opts.maxWeight!=null){
      var requested=Number(opts.maxWeight);
      if(!isFinite(requested)||requested<=0)return 0;
      cap=Math.min(cap,requested);
    }
    return cap;
  }

  function maxItemsForWeight(itemId,cap){
    var weight=Math.max(1,Number(itemInfo(itemId).w)||1);
    return cap===Infinity?Infinity:Math.max(0,Math.floor(cap/weight));
  }

  function reservationForCarrier(colony, carrierId){
    var list=ensureState(colony).reservations;
    for(var i=0;i<list.length;i++) if(list[i]&&list[i].carrierId===carrierId) return list[i];
    return null;
  }

  function reserveForTask(colony, stock, entities, taskOrId, carrierId, opts){
    var s=ensureState(colony);
    var task=typeof taskOrId==='string'?taskFor(colony,taskOrId):taskOrId;
    opts=opts||{};
    if(!task) return {ok:false,why:'missing-task'};
    if(!carrierId) return {ok:false,why:'missing-carrier'};
    var existing=reservationForCarrier(colony,carrierId);
    if(existing) return {ok:true,reservation:existing,reused:true};
    var ts=taskState(colony,task), keys=Object.keys(ts.missing);
    if(!keys.length) return {ok:false,why:ts.ready?'ready':'fully-reserved'};
    var key=keys[0], need=ts.missing[key], candidates=[],weightCap=carryWeightLimit(opts);
    var stockSpot=opts.stockSpot||{x:opts.stockX||0,y:opts.stockY||0};
    var stockFree=Math.max(0,(Number(stock&&stock[key])||0)-sourceReserved(s,'stock','stock:'+key,key));
    var stockItemId=itemIdForKey(key),stockMax=maxItemsForWeight(stockItemId,weightCap);
    var stockCount=Math.min(need,stockFree,stockMax);
    if(stockCount>0) candidates.push({kind:'stock',id:'stock:'+key,x:stockSpot.x||0,y:stockSpot.y||0,
      key:key,itemId:stockItemId,amount:stockCount,itemCount:stockCount});
    (entities||[]).forEach(function(e){
      if(!e||e.dead||e.type!==(T.DROPPED||'dropped')||!e.itemId||!e.id) return;
      var mul=requirementUnits(e.itemId,key);
      if(!mul) return;
      var freeItems=Math.max(0,(e.n||1)-sourceReserved(s,'drop',e.id,key));
      if(!freeItems) return;
      var itemCount=Math.min(freeItems,Math.ceil(need/mul),maxItemsForWeight(e.itemId,weightCap));
      if(itemCount<=0)return;
      candidates.push({kind:'drop',id:e.id,x:e.x||0,y:e.y||0,key:key,itemId:e.itemId,
        amount:itemCount*mul,itemCount:itemCount});
    });
    if(!candidates.length) return {ok:false,why:'missing-material',key:key,amount:need};
    if(opts.from) candidates.sort(function(a,b){ return dist(opts.from,a)-dist(opts.from,b); });
    var src=candidates[0];
    var r={id:'lr_'+(s.nextReservation++),taskId:task.id,carrierId:carrierId,key:key,
      amount:src.amount,phase:'reserved',source:src,lastX:src.x,lastY:src.y};
    s.reservations.push(r);
    return {ok:true,reservation:r,task:task};
  }

  function removeReservation(s,id){
    for(var i=0;i<s.reservations.length;i++) if(s.reservations[i]&&s.reservations[i].id===id) return s.reservations.splice(i,1)[0];
    return null;
  }

  function pickup(colony, stock, entities, reservationId, carrierId, carrierPos){
    var s=ensureState(colony), r=null;
    for(var i=0;i<s.reservations.length;i++) if(s.reservations[i]&&s.reservations[i].id===reservationId) r=s.reservations[i];
    if(!r) return {ok:false,why:'missing-reservation'};
    if(r.carrierId!==carrierId) return {ok:false,why:'wrong-carrier'};
    if(r.phase==='carrying') return {ok:true,reservation:r,reused:true};
    var pickR=logisticsCfg().pickupR;
    if(pickR==null) pickR=logisticsCfg().grabR!=null?logisticsCfg().grabR:18;
    if(!carrierPos) return {ok:false,why:'too-far'};
    if(r.source.kind==='stock'){
      if(dist(carrierPos,r.source)>pickR) return {ok:false,why:'too-far'};
      if(!stock || (stock[r.key]||0)<r.amount){ removeReservation(s,r.id); return {ok:false,why:'source-missing'}; }
      stock[r.key]-=r.amount;
    }else{
      var drop=null;
      for(i=0;i<(entities||[]).length;i++){
        var candidate=entities[i];
        if(candidate&&!candidate.dead&&candidate.id===r.source.id&&candidate.itemId===r.source.itemId){drop=candidate;break;}
      }
      if(!drop || (drop.n||1)<r.source.itemCount){ removeReservation(s,r.id); return {ok:false,why:'source-missing'}; }
      if(dist(carrierPos,drop)>pickR) return {ok:false,why:'too-far'};
      drop.n=(drop.n||1)-r.source.itemCount;
      if(drop.n<=0) drop.dead=true;
    }
    r.phase='carrying'; r.lastX=carrierPos.x; r.lastY=carrierPos.y;
    r.cargo={itemId:r.source.itemId,itemCount:r.source.itemCount,amount:r.amount,key:r.key};
    return {ok:true,reservation:r,cargo:r.cargo};
  }

  function touchCargo(colony, reservationId, carrierPos){
    var r=null, list=ensureState(colony).reservations;
    for(var i=0;i<list.length;i++) if(list[i]&&list[i].id===reservationId) r=list[i];
    if(!r||r.phase!=='carrying'||!carrierPos) return false;
    r.lastX=carrierPos.x; r.lastY=carrierPos.y; return true;
  }

  function deliver(colony, taskOrId, reservationId, carrierId, carrierPos){
    var s=ensureState(colony), task=typeof taskOrId==='string'?taskFor(colony,taskOrId):taskOrId;
    if(!task) return {ok:false,why:'missing-task'};
    var r=null;
    for(var i=0;i<s.reservations.length;i++) if(s.reservations[i]&&s.reservations[i].id===reservationId) r=s.reservations[i];
    if(!r) return {ok:false,why:'missing-reservation'};
    if(r.taskId!==task.id) return {ok:false,why:'wrong-task'};
    if(r.carrierId!==carrierId) return {ok:false,why:'wrong-carrier'};
    if(r.phase!=='carrying') return {ok:false,why:'not-carrying'};
    var deliverR=logisticsCfg().deliverR;
    if(deliverR==null) deliverR=logisticsCfg().dumpR!=null?logisticsCfg().dumpR:36;
    var destination=task.deliverySpot||task;
    if(!carrierPos || dist(carrierPos,destination)>deliverR) return {ok:false,why:'too-far'};
    task.deliveredLots.push({key:r.key,amount:r.amount,itemId:r.cargo.itemId,
      itemCount:r.cargo.itemCount,sourceKind:r.source.kind});
    removeReservation(s,r.id);
    return {ok:true,task:task,state:taskState(colony,task)};
  }

  function lotDrop(lot,x,y){
    return {itemId:lot.itemId||itemIdForKey(lot.key),n:lot.itemCount||lot.amount||1,x:x||0,y:y||0,stock:true};
  }

  /* 部分消耗多单位物品时，余数已经是仓储计量单位，不能把整件原物品退回。
     例如 1 个合金碎片=3 矿材，工程只需 2；余下应是 1 矿材，而不是整件合金。 */
  function unitDrop(key, amount, x, y){
    return {itemId:itemIdForKey(key),n:amount,x:x||0,y:y||0,stock:true};
  }

  function cancelTask(colony, taskOrId, opts){
    var s=ensureState(colony), task=typeof taskOrId==='string'?taskFor(colony,taskOrId):taskOrId;
    opts=opts||{};
    if(!task) return {ok:false,why:'missing-task',drops:[]};
    var drops=[], released=[];
    s.reservations.slice().forEach(function(r){
      if(!r||r.taskId!==task.id) return;
      if(r.phase==='carrying') drops.push(lotDrop(r.cargo,r.lastX!=null?r.lastX:(opts.x!=null?opts.x:task.x),r.lastY!=null?r.lastY:(opts.y!=null?opts.y:task.y)));
      released.push(r.id); removeReservation(s,r.id);
    });
    var refundSpot=task.deliverySpot||task;
    (task.deliveredLots||[]).forEach(function(lot){ drops.push(lotDrop(lot,refundSpot.x,refundSpot.y)); });
    s.tasks=s.tasks.filter(function(t){ return t&&t.id!==task.id; });
    return {ok:true,drops:drops,released:released};
  }

  /* 搬运者失能/改令：只释放这个人的锁。已送达材料仍归工地，不取消任务。 */
  function releaseCarrier(colony, carrierId, pos){
    var s=ensureState(colony), drops=[], released=[];
    s.reservations.slice().forEach(function(r){
      if(!r||r.carrierId!==carrierId) return;
      if(r.phase==='carrying') drops.push(lotDrop(r.cargo,
        pos&&pos.x!=null?pos.x:r.lastX,
        pos&&pos.y!=null?pos.y:r.lastY));
      released.push(r.id); removeReservation(s,r.id);
    });
    return {ok:true,drops:drops,released:released};
  }

  function completeTask(colony, taskOrId){
    var s=ensureState(colony), task=typeof taskOrId==='string'?taskFor(colony,taskOrId):taskOrId;
    if(!task) return {ok:false,why:'missing-task',drops:[]};
    if(!taskState(colony,task).ready) return {ok:false,why:'materials-missing',drops:[]};
    var remaining=copyCounts(task.need), consumed={}, drops=[];
    var dropAt=task.deliverySpot||task;
    (task.deliveredLots||[]).forEach(function(lot){
      if(!lot) return;
      var amount=lotUnits(lot), need=Math.max(0,remaining[lot.key]||0);
      var used=Math.min(amount,need), extra=Math.max(0,amount-used);
      if(used>0){ consumed[lot.key]=(consumed[lot.key]||0)+used; remaining[lot.key]=need-used; }
      if(extra<=0) return;
      /* 完全没用到的批次仍是原物品；只用掉一部分时则把余量规范化为 key 的单位物品。 */
      if(used===0) drops.push(lotDrop(lot,dropAt.x,dropAt.y));
      else drops.push(unitDrop(lot.key,extra,dropAt.x,dropAt.y));
    });
    s.reservations=s.reservations.filter(function(r){ return r&&r.taskId!==task.id; });
    s.tasks=s.tasks.filter(function(t){ return t&&t.id!==task.id; });
    return {ok:true,consumed:consumed,drops:drops};
  }

  function hasConstructionTarget(colony, task){
    var queue=[];
    if(Array.isArray(colony&&colony.buildQueue)) queue=queue.concat(colony.buildQueue);
    if(Array.isArray(colony&&colony.queue)) queue=queue.concat(colony.queue);
    return queue.some(function(q){
      if(!q) return false;
      return q.taskId===task.id || (!!task.targetId && (q.uid===task.targetId || q.id===task.targetId));
    });
  }

  function restore(colony, stock, entities){
    var s=ensureState(colony), carriers={}, drops=[], reattached=[], released=[];
    (entities||[]).forEach(function(e){ if(e&&!e.dead&&(e.rid||e.id)) carriers[e.rid||e.id]=e; });
    /* 施工目标已经不在队列时，任务不能因为原搬运者仍在就永久续送。
       按取消语义把在途货留在最后位置、已送达货留在原工地。 */
    s.tasks.slice().forEach(function(task){
      if(!task || (task.kind!=='construction' && task.kind!=='blueprint')) return;
      if(hasConstructionTarget(colony,task)) return;
      var cancelled=cancelTask(colony,task);
      drops=drops.concat(cancelled.drops||[]);
      released=released.concat(cancelled.released||[]);
    });
    s.reservations.slice().forEach(function(r){
      var task=taskFor(colony,r.taskId);
      if(r.phase!=='carrying'){
        released.push(r.id); removeReservation(s,r.id); return;
      }
      var carrier=carriers[r.carrierId];
      if(task&&carrier){
        reattached.push({carrierId:r.carrierId,reservationId:r.id,cargo:r.cargo});
        return;
      }
      drops.push(lotDrop(r.cargo,r.lastX!=null?r.lastX:(task?task.x:0),r.lastY!=null?r.lastY:(task?task.y:0)));
      released.push(r.id); removeReservation(s,r.id);
    });
    return {drops:drops,reattached:reattached,released:released};
  }

  return {
    ensureState:ensureState, ensureTask:ensureTask, taskFor:taskFor, taskForTarget:taskForTarget,
    taskState:taskState, inventoryOf:inventoryOf, available:available, availableDrop:availableDrop,
    reserveForTask:reserveForTask, reservationForCarrier:reservationForCarrier,
    pickup:pickup, touchCargo:touchCargo, deliver:deliver,
    cancelTask:cancelTask, releaseCarrier:releaseCarrier,
    completeTask:completeTask, restore:restore
  };
})();
