/* Repairable home wreckage lifecycle. Materials still flow through the normal
   construction queue and Logistics; this module only owns the wreckage lock. */
window.APH = window.APH || {};

APH.Recovery = (function(){
  'use strict';

  var CFG=APH.CFG;

  function result(ok, why, q){ return {ok:!!ok,why:why||'',q:q||null}; }
  function sourceId(e){ return e && e.id != null ? String(e.id) : ''; }
  function stableUid(e){ return 'repair_'+String((e&&e.uid)||sourceId(e)); }
  function isModernHome(s){
    return !!(s&&s.scene==='home'&&s.colony&&s.colony.rulesVersion===1&&
      s.colony.scene&&APH.TerrainModel&&APH.TerrainModel.isHome(s.colony.scene));
  }
  function liveSource(s,id){
    var found=null;
    (s&&s.entities||[]).some(function(e){
      if(e&&(String(e.id)===String(id)||String(e.uid)===String(id))){found=e;return true;}
      return false;
    });
    return found;
  }
  function recoveryQueues(s){
    return (s&&s.colony&&s.colony.buildQueue||[]).filter(function(q){return q&&q.repairSourceId;});
  }
  function placementState(s, source){
    var view=Object.assign({},s), colony=Object.assign({},s.colony);
    colony.buildings=(s.colony.buildings||[]).slice();
    colony.buildQueue=(s.colony.buildQueue||[]).slice();
    view.colony=colony;
    view.entities=(s.entities||[]).filter(function(e){return e!==source;});
    /* A recovery is still gated by the real research tree even in free-build mode. */
    view.devFreeBuild=false;
    return view;
  }
  function scaledNeed(def, residents){
    var bonuses=APH.Res&&APH.Res.globalBonuses?APH.Res.globalBonuses(residents||[]):{buildCostMul:1};
    var base=APH.Construction.materialNeed(def,bonuses.buildCostMul==null?1:bonuses.buildCostMul);
    var fraction=CFG.recovery&&CFG.recovery.materialFraction!=null?CFG.recovery.materialFraction:.5;
    var need={};
    Object.keys(base).forEach(function(key){
      var amount=Math.max(0,Math.round(base[key]*fraction));
      if(amount)need[key]=amount;
    });
    return need;
  }
  function clearGatherOrders(s, source){
    var id=sourceId(source), uid=String(source.uid||id);
    (s.entities||[]).forEach(function(e){
      var order=e&&e.userOrder;
      if(!order||order.type!=='gather')return;
      var target=order.flora, targetId=order.floraId||order.targetId||
        (target&&(target.id!=null?target.id:target.uid));
      if(target===source||String(targetId)===id||String(targetId)===uid)e.userOrder=null;
    });
  }

  function plan(s,e){
    if(!isModernHome(s))return result(false,'仅现代家园可修复残骸');
    if(!e||e.dead||e.depleted||e.hp===0)return result(false,'残骸已不存在');
    if(e.type!==CFG.entType.FLORA||e.kind!=='rock_wreckage'||!e.repairable||!e.repairBid)
      return result(false,'该残骸无法修复');
    var id=sourceId(e);
    if(!id)return result(false,'残骸缺少稳定编号');
    var queue=s.colony.buildQueue||(s.colony.buildQueue=[]);
    if(e.pendingRepair||queue.some(function(q){return q&&String(q.repairSourceId)===id;}))
      return result(false,'该残骸已有修复蓝图');
    var planned=APH.Construction.ghost(placementState(s,e),e.repairBid,e.x,e.y,e.repairRotation||0);
    if(!planned.ok)return result(false,planned.why);
    var def=APH.Colony.get(e.repairBid);
    var uid=stableUid(e);
    if(queue.some(function(q){return q&&q.uid===uid;}))return result(false,'修复蓝图编号冲突');
    var q=Object.assign({},planned.record,{
      uid:uid,
      total:def.buildTime!=null?def.buildTime:5,
      progress:0,
      materialsPaid:false,
      need:scaledNeed(def,s.meta&&s.meta.residents),
      repairSourceId:e.id
    });
    queue.push(q);
    if(s.entities)s.entities.push(Object.assign({},q,{
      id:q.uid,type:CFG.entType.BLUEPRINT,progress:0,building:false
    }));
    e.pendingRepair=q.uid;
    if(s.designations){delete s.designations[id];if(e.uid!=null)delete s.designations[e.uid];}
    clearGatherOrders(s,e);
    return result(true,'',q);
  }

  function cancel(s,q){
    if(!s||!q||!q.repairSourceId)return result(false,'不是残骸修复蓝图');
    var source=liveSource(s,q.repairSourceId);
    if(!source)return result(false,'修复残骸不存在');
    if(source.pendingRepair!==q.uid)return result(false,'残骸未由该蓝图锁定');
    delete source.pendingRepair;
    return result(true,'',q);
  }

  function complete(s,q){
    if(!s||!s.colony||!q||!q.repairSourceId)return result(false,'不是残骸修复蓝图');
    var id=String(q.repairSourceId), source=liveSource(s,id);
    s.colony.depleted=s.colony.depleted||{};
    s.colony.floraState=s.colony.floraState||{};
    if(!source){
      if(s.colony.depleted[id])return {ok:true,why:'',q:q,already:true,source:null};
      return result(false,'修复残骸不存在',q);
    }
    var already=!!(source.dead||source.depleted||s.colony.depleted[source.uid||id]);
    source.hp=0;
    source.amount=0;
    source.dead=true;
    source.depleted=true;
    source._queued=true;
    delete source.pendingRepair;
    s.colony.depleted[source.uid||id]=true;
    s.colony.floraState[source.id||id]={hp:0,dead:true,depleted:true};
    return {ok:true,why:'',q:q,already:already,source:source};
  }

  function reconcile(s){
    var queues=recoveryQueues(s), byUid={}, unlocked=[], relocked=[], errors=[];
    queues.forEach(function(q){if(q.uid)byUid[q.uid]=q;});
    (s&&s.entities||[]).forEach(function(source){
      if(!source||!source.pendingRepair)return;
      var q=byUid[source.pendingRepair];
      if(!q||String(q.repairSourceId)!==sourceId(source)){
        unlocked.push(sourceId(source));
        delete source.pendingRepair;
      }
    });
    var claimed={};
    queues.forEach(function(q){
      var id=String(q.repairSourceId), source=liveSource(s,id);
      if(!source||source.dead||source.depleted||s.colony&&s.colony.depleted&&s.colony.depleted[id]){
        errors.push({q:q,sourceId:id,why:'修复残骸不存在'});
        return;
      }
      if(claimed[id]&&claimed[id]!==q.uid){
        errors.push({q:q,sourceId:id,why:'同一残骸存在重复修复蓝图'});
        return;
      }
      claimed[id]=q.uid;
      if(source.pendingRepair&&source.pendingRepair!==q.uid){
        errors.push({q:q,sourceId:id,why:'残骸已被其他修复蓝图锁定'});
        return;
      }
      if(!source.pendingRepair){source.pendingRepair=q.uid;relocked.push(id);}
    });
    return {ok:errors.length===0,unlocked:unlocked,relocked:relocked,errors:errors};
  }

  return {plan:plan,cancel:cancel,complete:complete,reconcile:reconcile};
})();
