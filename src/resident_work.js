/* ============================================================
   Aphelion · resident_work.js — 居民世界侧接线 (ADR-41/42/43 拆分第三批, #206)
   每个 home tick 把 roster 投影成场上实体, 再按优先级驱动它们: 任务/医学床位 →
   社交 → 征召 → 饥饿进食 → 搬运与仓储 → 采集/建造/游荡。
   挂载 window.APH.ResidentWork; 读 APH.state, 不碰 DOM —— 提示走 U.emit('notice')。
   ============================================================ */
window.APH = window.APH || {};

APH.ResidentWork = (function(){
  'use strict';
  var CFG = APH.CFG, U = APH.U, T = (APH.CFG && APH.CFG.entType) || {};

  function pickHuntedAnimal(x, y){
    var s=APH.state;
    if(!s.designations) return null;
    var best=null, bestD=800;
    (s.entities||[]).forEach(function(e){
      if(!e || e.dead || e.type!=='animal') return;
      var des=s.designations[e.id];
      if(!des || des.type!=='hunt') return;
      var d=U.dst(x,y,e.x,e.y);
      if(d<bestD){ bestD=d; best=e; }
    });
    return best;
  }

  function pickDesignatedFloraAt(x, y){
    var s = APH.state;
    if(!s.designations) return null;
    var searchR = (CFG.gathering && CFG.gathering.searchRadius) || 800;
    var typePrio = ((CFG.gathering && CFG.gathering.typePriority) || ['tree','rock_stone','rock_iron','bush_berry','bush_herb']).concat(['bush_alien','rock_wreckage']);
    var best = null, bestD = searchR;
    for(var tp = 0; tp < typePrio.length; tp++){
      for(var fi = 0; fi < (s.entities || []).length; fi++){
        var fe = s.entities[fi];
        if(!fe || fe.dead || fe.type !== T.FLORA || fe.kind !== typePrio[tp]) continue;
        var des = s.designations[fe.id];
        if(!des || (des.type !== 'chop' && des.type !== 'mine')) continue;
        var fd = U.dst(x, y, fe.x, fe.y);
        if(fd < bestD){ bestD = fd; best = fe; }
      }
      if(best) break;
    }
    return best;
  }

  function pawnWorldAt(x, y, haulCarry, resident){
    var s = APH.state;
    var house=null, hd=Infinity;
    (s.colony && s.colony.buildings || []).forEach(function(b){
      if(!b || b.dead || b.id!=='bl_house') return;
      var d=U.dst(x,y,b.x,b.y);
      if(d<hd){ hd=d; house=b; }
    });
    var bed=assignedHomeBed(resident,(s.colony&&s.colony.buildings)||[]);
    if(bed)house=APH.Construction.spot(s,bed,{x:x,y:y});
    else if(s.colony.rulesVersion)house=null;
    var berry=null, berryD=(CFG.gathering&&CFG.gathering.searchRadius)||800;
    (s.entities||[]).forEach(function(be){
      if(!be || be.dead || be.type!==T.FLORA || be.kind!=='bush_berry') return;
      var bd=U.dst(x,y,be.x,be.y);
      if(bd<berryD){ berryD=bd; berry=be; }
    });
    var rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf((s.colony&&s.colony.buildings)||[],s.colony&&s.colony.scene):[];
    var storage=null;
    var firstCarry=Array.isArray(haulCarry)?haulCarry[0]:haulCarry;
    if(firstCarry && firstCarry.itemId && APH.Colony.findBestStorageSpot){
      storage=storageDestination(s,firstCarry.itemId,{x:x,y:y});
    } else if(APH.Colony.stockpileSpot){
      storage=APH.Colony.stockpileSpot(s.colony&&s.colony.buildings);
    }
    return {
      raid: !!(s.war&&s.war.raidActive),
      night: !!(window.APH.World && APH.World.daylight && APH.World.daylight()<0.5),
      eatBelow: APH.Res.foodEatBelow(),
      restSleepAt: (CFG.player&&CFG.player.restSleepAt!=null)?CFG.player.restSleepAt:20,
      restNightAt: (CFG.player&&CFG.player.restNightAt!=null)?CFG.player.restNightAt:75,
      joyAt: (CFG.residents&&CFG.residents.recreationJoyAt!=null)?CFG.residents.recreationJoyAt:30,
      hour: (APH.Res && APH.Res.hourOfDay) ? APH.Res.hourOfDay(s.clock||0, CFG.DAY_LEN) : 0,
      meal: APH.Colony.nearestMeal({x:x,y:y}, 1e9),
      house: house,
      blueprint: nearestBlueprint(x,y),
      drop: nearestDrop({x:x,y:y}, (CFG.haul&&CFG.haul.seekR)||1200),
      flora: pickDesignatedFloraAt(x,y),
      hunt: pickHuntedAnimal(x,y),
      filth: (APH.Colony && APH.Colony.dirtiestCell) ? APH.Colony.dirtiestCell(s.colony && s.colony.filth) : null,
      berry: berry,
      joy: findJoySpot(x,y),
      storage: storage
    };
  }

  function pickIdleDest(fromX, fromY){
    var s = APH.state;
    var C = CFG.idle || {};
    var hab = CFG.HAB || {x:1100,y:1100};
    var roll = Math.random();
    var dest = null;
    if(roll < 0.28){
      var blds = (s.colony && s.colony.buildings) || [];
      if(blds.length){
        var b = blds[Math.floor(Math.random()*blds.length)];
        dest = { x: (b.x||hab.x) + U.rr(-28,28), y: (b.y||hab.y) + U.rr(16,44) };
      }
    }
    if(!dest && roll < 0.52){
      var floraLook = [];
      var lookR = C.lookFloraR != null ? C.lookFloraR : 420;
      (s.entities||[]).forEach(function(e){
        if(e && !e.dead && e.type===T.FLORA && U.dst(fromX, fromY, e.x, e.y) < lookR) floraLook.push(e);
      });
      if(floraLook.length){
        var f = floraLook[Math.floor(Math.random()*floraLook.length)];
        dest = { x: f.x + U.rr(-40,40), y: f.y + U.rr(18,42) };
      }
    }
    if(!dest && roll < 0.78){
      var angL = Math.random()*Math.PI*2;
      var radL = U.rr(C.localRMin!=null?C.localRMin:40, C.localRMax!=null?C.localRMax:120);
      dest = { x: fromX + Math.cos(angL)*radL, y: fromY + Math.sin(angL)*radL };
    }
    if(!dest){
      var ang = Math.random()*Math.PI*2;
      var rad = U.rr(C.wanderRMin!=null?C.wanderRMin:50, C.wanderRMax!=null?C.wanderRMax:220);
      dest = { x: hab.x + Math.cos(ang)*rad, y: hab.y + Math.sin(ang)*rad };
    }
    dest.x = U.clamp(dest.x, 80, APH.Scene.width()-80);
    dest.y = U.clamp(dest.y, 80, APH.Scene.height()-80);
    var rid = arguments[2] || (s.meta && s.meta.playerRestrictId);
    if(rid && APH.Colony.pointAllowed){
      if(!APH.Colony.pointAllowed(s.colony.zones||[], { restrictId:rid }, dest.x, dest.y)){
        var z=null;
        (s.colony.zones||[]).forEach(function(zz){ if(zz && zz.id===rid) z=zz; });
        if(z && z.cells && z.cells.length){
          var c=z.cells[Math.floor(Math.random()*z.cells.length)];
          dest={ x:c.x, y:c.y };
        }
      }
    }
    return dest;
  }

  function findJoySpot(x, y){
    var s = APH.state;
    var best=null, bd=900;
    function consider(b){
      if(!b || b.dead) return;
      var bx=b.x, by=b.y;
      var d=U.dst(x,y,bx,by);
      if(d<bd){ bd=d; best=b; }
    }
    (s.colony && s.colony.buildings || []).forEach(function(b){
      if(b.id==='bl_campfire' || b.id==='bl_tv' || b.bid==='bl_campfire' || b.bid==='bl_tv') consider(b);
    });
    (s.entities||[]).forEach(function(en){
      if(en && en.type===T.BUILDING && (en.bid==='bl_campfire'||en.bid==='bl_tv')) consider(en);
    });
    return best;
  }

  function nearestBlueprint(x, y){
    var q=(APH.state.colony && APH.state.colony.buildQueue) || [];
    var best=null, bd=1e9;
    for(var i=0;i<q.length;i++){
      if(!q[i]) continue;
      if(q[i].materialsPaid===false&&(!q[i].taskId||!APH.Logistics.taskState(APH.state.colony,q[i].taskId).ready))continue;
      var d=U.dst(x,y,q[i].x,q[i].y);
      if(d<bd){ bd=d; best=q[i]; }
    }
    return best;
  }

  function tryResidentJoy(e, r, dt, spdMul, navGrid){
    if(!r || r.wantSleep || r.isSleeping || r.downed) return false;
    var joyAt=(CFG.residents&&CFG.residents.recreationJoyAt!=null)?CFG.residents.recreationJoyAt:30;
    if((r.recreation!=null?r.recreation:80) >= joyAt) return false;
    var jy=findJoySpot(e.x,e.y);
    if(!jy) return false;
    if(U.dst(e.x,e.y,jy.x,jy.y)<52){
      if(APH.Res.enjoyRecreation) APH.Res.enjoyRecreation(r, (CFG.residents&&CFG.residents.campfireRecGain)||10);
      e.walking=false; e.tx=e.x; e.ty=e.y;
    } else {
      e.tx=jy.x; e.ty=jy.y+12;
      APH.Res.walkAround(e,{x:e.tx,y:e.ty},dt,spdMul,navGrid);
    }
    return true;
  }

  function residentIdleStroll(e, dt){
    var C = CFG.idle || {};
    e.wanderT = (e.wanderT || 0) - dt;
    if(e.wanderT > 0) return;
    var pauseChance = C.pauseChance != null ? C.pauseChance : 0.2;
    if(Math.random() < pauseChance){
      e.wanderIdle = true;
      e.wanderT = U.rr(C.pauseMin!=null?C.pauseMin:1.0, C.pauseMax!=null?C.pauseMax:2.4);
      e.walking = false;
      e.tx = e.x; e.ty = e.y;
      e.face = Math.random() * Math.PI * 2;
      return;
    }
    e.wanderIdle = false;
    e.wanderT = U.rr(C.strollMin!=null?C.strollMin:2.8, C.strollMax!=null?C.strollMax:5.5);
    var rr = APH.Res.residentOf(e);
    var dest = pickIdleDest(e.x, e.y, rr && rr.restrictId);
    e.tx = dest.x; e.ty = dest.y;
  }

  function pulseGatherWork(flora, worker, dt){
    var s = APH.state;
    if(!flora || flora.dead) return;
    var period = (CFG.gathering && CFG.gathering.strikePeriod != null) ? CFG.gathering.strikePeriod : 0.45;
    flora.chopT = (flora.chopT || 0) + (dt || 0);
    if(worker){
      worker.gathering = true;
      worker.walking = false;
      worker.moving = false;
      var wx = worker.x != null ? worker.x : s.px;
      var wy = worker.y != null ? worker.y : s.py;
      var ang = Math.atan2(flora.y - wy, flora.x - wx);
      worker.face = ang;
      if(worker.type === T.PLAYER || worker.id === 'player'){
        s.gathering = true;
        s.face = ang;
      }
    }
    if(flora.chopT < period) return;
    flora.chopT -= period;
    flora.chopAt = s.clock || 0;
    var isRock = !!(flora.kind && flora.kind.indexOf('rock') === 0);
    var hue = isRock ? 210 : 32;
    for(var i = 0; i < 5; i++){
      s.parts.push({ t:'dust', x:flora.x+U.rr(-8,8), y:flora.y+U.rr(-14,-2), life:U.rr(.28,.5), max:.5 });
    }
    s.parts.push({ t:'shard', x:flora.x, y:flora.y-10, vx:U.rr(-70,70), vy:U.rr(-90,-20), life:.4, max:.4, hue:hue });
    s.parts.push({ t:'shard', x:flora.x, y:flora.y-8, vx:U.rr(-50,50), vy:U.rr(-70,-10), life:.35, max:.35, hue:hue });
  }

  function assignedHomeBed(r,buildings){
    if(!r||!r.bedId)return null;
    return (buildings||[]).find(function(b){
      return b&&!b.dead&&(b.id==='bl_bed'||b.id==='bl_house')&&r.bedId.indexOf((b.uid||(b.id+'@'+b.x+','+b.y))+':')===0;
    })||null;
  }

  function homeSpot(r, i, buildings){
    var assigned=assignedHomeBed(r,buildings);
    if(assigned){var p=APH.Construction.spot(APH.state,assigned,{x:assigned.x,y:assigned.y});if(p)return p;}
    var houses=(buildings||[]).filter(function(b){ return b.id==='bl_house'; });
    if(houses.length){
      var h=houses[i%houses.length];
      return { x:h.x+(i%2)*14-7, y:h.y+24 };
    }
    return { x:CFG.HAB.x+(i%5)*14-28, y:CFG.HAB.y+40 };
  }

  function residentSpot(r, i, buildings){
    var q=(APH.state.colony.buildQueue)||[];
    if((!r.job || r.job==='blueprint') && APH.Colony.isBuilder(r) && q.length){
      var bp=q[i%q.length];
      return { x:bp.x+12, y:bp.y+18 };
    }
    if(r.job){
      var bs=buildings.filter(function(b){ return b.id===r.job||(r.job==='bl_kitchen'&&b.id==='bl_campfire'); });
      if(bs.length){
        var b=bs[i%bs.length];
        if(b.geometryVersion===1){var p=APH.Construction.spot(APH.state,b,{x:r.x||b.x,y:r.y||b.y});if(p)return p;}
        return { x:b.x+16+(i%3)*10, y:b.y+22 };
      }
    }
    return homeSpot(r, i, buildings);
  }

  function syncResidentEntities(){
    var s=APH.state;
    if(s.scene!=='home') return;
    var buildings=s.colony.buildings||[];
    var roster=(s.meta.residents||[]).filter(function(r){return !r.worldId||r.worldId==='home';});
    var byId={};
    s.entities.forEach(function(e){
      if(e && e.type===T.RESIDENT) byId[e.rid||e.id]=e;
    });
    var keep={};
    var raid=!!(s.war&&s.war.raidActive);
    roster.forEach(function(r,i){
      var home=homeSpot(r,i,buildings);
      var job=residentSpot(r,i,buildings);
      var tgt=raid?home:job;
      var e=byId[r.id];
      if(!e){
        e={
          id:r.id, type:T.RESIDENT, x:home.x, y:home.y,
          name:r.name, rid:r.id, job:r.job, mood:r.mood, food:r.food,
          illness:r.illness||0, rest:r.rest, recreation:r.recreation, exposure:r.exposure,
          isSleeping:!!r.isSleeping, downed:!!r.downed, medLying:!!r.medLying,
          walking:false, face:Math.PI/2, walkPh:0,
        };
        s.entities.push(e);
      }else{
        e.name=r.name; e.job=r.job; e.mood=r.mood; e.food=r.food; e.illness=r.illness||0;
        e.rest=r.rest; e.recreation=r.recreation; e.exposure=r.exposure;
        e.isSleeping=!!r.isSleeping; e.downed=!!r.downed; e.medLying=!!r.medLying;
      }
      if(raid || (!e.userOrder && !e.gatherTarget && !e.haulCarry && (!e.wanderT || e.wanderT <= 0))){
        e.tx=tgt.x; e.ty=tgt.y;
      }
      keep[r.id]=true;
    });
    s.entities.forEach(function(e){
      if(e.type===T.RESIDENT && !keep[e.rid||e.id]){
        dropHaulCargo(s,e);
        var freed=APH.Logistics.releaseCarrier(s.colony,e.rid||e.id,e);
        (freed.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});
        APH.Ent.destroy(e);
      }
    });
    s.entities=APH.Ent.sweepDead(s.entities);
  }

  function dropStore(d){
    var it=(CFG.items&&d&&CFG.items[d.itemId])||{};
    return it.store||null;
  }

  function dropHaulCargo(s,e){
    if(!e||!e.haulCarry)return;
    var cargo=Array.isArray(e.haulCarry)?e.haulCarry:[e.haulCarry];
    cargo.forEach(function(p){if(p&&p.itemId&&p.n>0)APH.Combat.spawnDrop(e.x,e.y,p.itemId,p.n,{stock:true,jitter:0});});
    e.haulCarry=null;
  }

  function freeDropCount(s,e){
    return s.colony.rulesVersion===1?APH.Logistics.availableDrop(s.colony,e):(e&&!e.dead?(e.n||1):0);
  }

  function takeHaulPile(s,e,weightLeft){
    var limit=weightLeft==null?CFG.haul.carryWeight:Math.min(weightLeft,CFG.haul.carryWeight);
    var weight=(CFG.items[e.itemId]||{}).w||1;
    var count=Math.min(freeDropCount(s,e),Math.floor(limit/weight),CFG.storage.bulkHaulMaxCount);
    if(count<=0)return null;
    var cargo={itemId:e.itemId,n:count};
    e.n=(e.n||1)-count;if(e.n<=0)e.dead=true;
    return cargo;
  }

  function nearestDrop(from, r, pred){
    var s=APH.state;return APH.Ent.findNearest(s.entities,T.DROPPED,from.x,from.y,r,function(e){return freeDropCount(s,e)>0&&(!s.colony.rulesVersion||!APH.Storage.isStored(e,s))&&(!pred||pred(e));});
  }

  function applyNoTablePenalty(r){
    var C=CFG.residents||{};
    var pen=C.noTableMoodPenalty!=null?C.noTableMoodPenalty:-3;
    if(pen>=0) return;
    r.mood=Math.max(0, (r.mood||70)+pen);
  }

  function tryEatHere(e, r, grabR, dumpR, atTable, eatR){
    if(!r || !APH.Res.eatOnce || r.food==null || r.food>=CFG.residents.eatBelow) return false;
    /* T8: 在餐桌用餐浮标 (atTable=true: 居民到椅上吃, 显示 😋 在餐桌用餐) */
    var TBL_FLAG=!!atTable;
    /* T8: 桌旁吃略放宽取食半径 (椅到桌旁粮堆可略远) */
    var mealR = (eatR!=null) ? eatR : (TBL_FLAG && CFG.residents && CFG.residents.diningTableEatR!=null
      ? CFG.residents.diningTableEatR : grabR);
    var mealBundle=Array.isArray(e.haulCarry)?e.haulCarry:(e.haulCarry?[e.haulCarry]:[]);
    var heldFood=mealBundle.find(function(p){return dropStore(p)==='food'&&(p.n||1)>0;});
    if(heldFood){
      var itDefC = (CFG.items && CFG.items[heldFood.itemId]) || { name:'食物', foodGain:25 };
      var eatRes = (APH.Res.eatMeal) ? APH.Res.eatMeal(r, itDefC, { atTable: TBL_FLAG }) : { ate: APH.Res.eatOnce(r, itDefC) };
      if(!eatRes.ate) return false;
      heldFood.n=(heldFood.n||1)-1;
      mealBundle=mealBundle.filter(function(p){return p.n>0;});
      e.haulCarry=mealBundle.length?(Array.isArray(e.haulCarry)?mealBundle:mealBundle[0]):null;
      if(itDefC.isCooked){
        U.emit('notice', { text: (TBL_FLAG?'😋 '+(e.name||'居民')+' 在餐桌用餐':'😋 '+(e.name||'居民')+' 享用了 '+itDefC.name)+' (+'+(itDefC.foodGain||25)+'饱食 +'+(itDefC.moodGain||0)+'心情 +'+(itDefC.recGain||0)+'娱乐)', color: '#ffd54f' });
      }else{
        U.emit('notice', { text: (e.name||'居民')+(TBL_FLAG?' 在餐桌吃了饭':' 吃了手里的食物'), color: '#c8e89a' });
      }
      if(!TBL_FLAG){
        applyNoTablePenalty(r);
        if(APH.Colony.addFilth) APH.state.colony.filth = APH.Colony.addFilth(APH.state.colony.filth||{}, e.x, e.y, 12);
      }
      e.food=r.food;
      return true;
    }
    var meal=APH.Colony.nearestMeal(e, 1e9);
    if(!meal) return false;
    var need=meal.kind==='stock'?dumpR:mealR;
    if(U.dst(e.x,e.y,meal.x,meal.y)>=need) return false;
    if(meal.kind==='stock'){
      if((APH.state.meta.res.food||0)<=0) return false;
      if(!APH.Colony.takeStock(APH.state.meta.res,[],'food',1).ok)return false;
      /* T8: 有桌在仓库吃也计「在餐桌用餐」 */
      var eatStock = (APH.Res.eatMeal) ? APH.Res.eatMeal(r, null, { atTable: TBL_FLAG }) : { ate: APH.Res.eatOnce(r) };
      if(!eatStock.ate) return false;
      U.emit('notice', { text: (e.name||'居民')+(TBL_FLAG?' 在餐桌吃了口粮 (+'+(eatStock.foodGain||25)+'饱食 +'+(eatStock.moodGain||0)+'心情)':' 在仓库吃了口粮 (+25饱食)'), color: '#c8e89a' });
    }else{
      if(!meal.drop || meal.drop.dead) return false;
      var itDefG = (CFG.items && CFG.items[meal.drop.itemId]) || { name:'食物', foodGain:25 };
      if(APH.Colony.nibblePile(meal.drop,1)!==1)return false;
      var eatResG = (APH.Res.eatMeal) ? APH.Res.eatMeal(r, itDefG, { atTable: TBL_FLAG }) : { ate: APH.Res.eatOnce(r, itDefG) };
      if(!eatResG.ate) return false;
      if(itDefG.isCooked){
        U.emit('notice', { text: (TBL_FLAG?'😋 '+(e.name||'居民')+' 在餐桌用餐':'😋 '+(e.name||'居民')+' 享用了 '+itDefG.name)+' (+'+(itDefG.foodGain||25)+'饱食 +'+(itDefG.moodGain||0)+'心情 +'+(itDefG.recGain||0)+'娱乐)', color: '#ffd54f' });
      }else{
        U.emit('notice', { text: (e.name||'居民')+(TBL_FLAG?' 在餐桌吃了饭':' 吃了地上的食物'), color: '#c8e89a' });
      }
    }
    if(!TBL_FLAG){
      applyNoTablePenalty(r);
      if(APH.Colony.addFilth) APH.state.colony.filth = APH.Colony.addFilth(APH.state.colony.filth||{}, e.x, e.y, 12);
    }
    e.food=r.food;
    return true;
  }

  function storageDestination(s,itemId,from){
    if(s.colony.rulesVersion&&APH.Storage)return APH.Storage.destination(s,itemId,from);
    return APH.Colony.findBestStorageSpot(itemId,s.colony.buildings,APH.Nav.roomsOf(s.colony.buildings,s.colony.scene),from,s.colony.zones);
  }

  function storeCarried(s,e){
    if(!e.haulCarry)return false;
    var bundle=Array.isArray(e.haulCarry)?e.haulCarry:[e.haulCarry],left=[],stored=false;
    bundle.forEach(function(cp){
      var dest=storageDestination(s,cp.itemId,e);
      if(!dest||U.dst(e.x,e.y,dest.x,dest.y)>((CFG.haul&&CFG.haul.dumpR)||36)){left.push(cp);return;}
      var result=APH.Storage.deposit(s,cp.itemId,cp.n||1,dest);
      if(!result.ok){left.push(cp);return;}
      stored=true;
    });
    e.haulCarry=left.length?(Array.isArray(e.haulCarry)?left:left[0]):null;
    if(!stored)e.workReason='仓储位置不可达，保留携带物资';
    return stored;
  }

  function moveConstructionMaterials(s,e,r,dt,speed,nav){
    var L=APH.Logistics;if(!L)return false;
    if(e.haulCarry)return false;
    var reservation=L.reservationForCarrier(s.colony,r.id),task=null,q=null;
    var urgent=r.downed||r.isSleeping||r.food<25||r.rest<10||e.drafted||e.userOrder&&e.userOrder.type!=='build';
    if(urgent){
      if(reservation&&L.releaseCarrier){var released=L.releaseCarrier(s.colony,r.id,e);(released.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});}
      return false;
    }
    var production=APH.ProductionJobs?APH.ProductionJobs.targets(s):[];
    if(reservation){task=L.taskFor(s.colony,reservation.taskId);q=(s.colony.buildQueue||[]).find(function(x){return x.taskId===reservation.taskId;});if(!q){var station=production.find(function(x){return x.task.id===reservation.taskId;});q=station&&station.building;}}
    if(!reservation){
      var prio=(s.meta.workPrio||{})[r.id]||{};
      var candidates=[];
      if(prio.sk_build!==0&&(!r.job||r.job==='blueprint'))(s.colony.buildQueue||[]).forEach(function(bp){
        if(bp.materialsPaid!==false)return;
        var t=L.ensureTask(s.colony,{id:bp.taskId,kind:'construction',targetId:bp.uid,x:bp.x,y:bp.y,need:bp.need});bp.taskId=t.id;candidates.push({building:bp,task:t});
      });
      if(prio.sk_haul!==0&&!(e.userOrder&&e.userOrder.type==='build'))production.forEach(function(station){if(station.job==='haul'||!r.job||r.job===station.job)candidates.push(station);});
      for(var i=0;i<candidates.length;i++){
        q=candidates[i].building;task=candidates[i].task;
        var result=L.reserveForTask(s.colony,s.meta.res,s.entities,task.id,r.id,{stockSpot:{x:CFG.HAB.x,y:CFG.HAB.y+140},from:e});
        if(result.ok){reservation=result.reservation;break;}
      }
    }
    if(reservation&&(!task||!q)){
      var orphan=L.releaseCarrier(s.colony,r.id,e);
      (orphan.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});
      return false;
    }
    if(!reservation||!task||!q)return false;
    var target=reservation.source;
    if(reservation.phase==='carrying'){
      L.touchCargo(s.colony,reservation.id,e);
      target=APH.Construction.spot(s,q,e);
      if(!target){e.workReason='材料接收位置被堵住';e.walking=false;var blocked=L.releaseCarrier(s.colony,r.id,e);(blocked.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});return true;}
      task.deliverySpot=target;
    }
    if(!APH.Nav.astar(nav,e,target)){
      e.workReason='运输路径被堵住';e.walking=false;
      if(L.releaseCarrier){var freed=L.releaseCarrier(s.colony,r.id,e);(freed.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});}
      return true;
    }
    e.workReason=(reservation.phase==='carrying'?'运送':'前往取')+(task.kind==='production'?'加工材料':'施工材料');e.workAnim='haul';
    APH.Res.walkAround(e,target,dt,speed,nav);
    if(reservation.phase==='reserved')L.pickup(s.colony,s.meta.res,s.entities,reservation.id,r.id,e);
    else L.deliver(s.colony,task,reservation.id,r.id,e);
    return true;
  }

  function update(s, dt){
    if(APH.EntityIndex)APH.EntityIndex.prepare(s.entities);
    var m=s.meta;
    if(s.scene!=='home') return;
    if(APH.ProductionJobs)APH.ProductionJobs.prepare(s);
    if(APH.Storage)APH.Storage.prepare(s);
    syncResidentEntities();
    var spd=(CFG.walk&&CFG.walk.speed)||56;
    /* W3 天气效果(家园): 居民室外移动减速乘子(寒潮+防寒服=免; 远征不适用) */
    var resWxId=(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(s.meta):'wx_clear';
    var resWxEff=(window.APH.Weather&&APH.Weather.weatherEffects)?APH.Weather.weatherEffects(resWxId):null;
    var resWxSpeedMul=(resWxEff&&resWxEff.speedMul!=null)?resWxEff.speedMul:1;
    var H=CFG.haul||{};
    var pickR=H.pickR!=null?H.pickR:52;
    var seekR=H.seekR!=null?H.seekR:420;
    var grabR=H.grabR!=null?H.grabR:18;
    var dumpR=H.dumpR!=null?H.dumpR:36;
    var raid=!!(s.war&&s.war.raidActive);
    var stock=APH.Colony.stockpileSpot(s.colony&&s.colony.buildings);
    var eatBelow=(CFG.residents&&CFG.residents.eatBelow!=null)?CFG.residents.eatBelow:60;
    /* T8 餐桌椅 (#81): 每帧收集桌椅+饥饿居民 → 座位分配 (纯函数; 每椅1人, 懒汉不受) */
    var diningTbls=[], diningChairs=[];
    (s.colony&&s.colony.buildings||[]).forEach(function(b){
      if(b.id==='bl_dining_table' && !b.dead) diningTbls.push(b);
      else if(b.id==='bl_dining_chair' && !b.dead) diningChairs.push(b);
    });
    var hungryRes=[], seatMap={};
    if(!raid && diningTbls.length && diningChairs.length){
      s.entities.forEach(function(e){
        if(e && e.type===T.RESIDENT){
          var r0=APH.Res.residentOf(e);
          if(r0 && r0.food!=null && r0.food<eatBelow) hungryRes.push({id:r0.id,x:e.x,y:e.y});
        }
      });
      var preferredSeats={};
      s.entities.forEach(function(e){if(e&&e.type===T.RESIDENT&&e.diningSeatUid)preferredSeats[e.rid||e.id]=e.diningSeatUid;});
      seatMap=APH.Res.diningSeatAlloc(hungryRes, diningChairs, diningTbls,{modern:s.colony.rulesVersion===1,preferred:preferredSeats});
      s.entities.forEach(function(e){if(e&&e.type===T.RESIDENT){var seat=seatMap[e.rid||e.id];e.diningSeatUid=seat?(seat.chair.uid||seat.chair.id):null;}});
    }
    /* T3 绕墙走位: 每帧一张障碍矩阵(墙/围攻营地=1, 闸门=0), 居民共享 */
    var navGrid=(window.APH.Nav&&APH.Nav.gridOf)?APH.Nav.gridOf((s.colony&&s.colony.buildings)||[],s.colony&&s.colony.scene):null;
    var observedNavGrid=s.colony&&s.colony.scene&&s.colony.scene.generation===1&&window.APH.TerrainModel&&
      APH.TerrainModel.hasObservation(s.colony.scene)?navGrid:null;
    /* T9 无顶房间: 墙/门围合区域 (每帧重算, 46×46 flood) —— 供暴露/心情/路灯照明 */
    var rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf((s.colony&&s.colony.buildings)||[],s.colony&&s.colony.scene):[];

    /* ADR-22 居民场上相遇与 Emoji 微气泡 */
    s.socialCooldowns = s.socialCooldowns || {};
    var nowSec = s.clock || 0;
    var resEntities = s.entities.filter(function(ent){ return ent && ent.type === T.RESIDENT && !ent.dead; });
    var encR = (CFG.social && CFG.social.encounterArriveR) || 40;
    for(var sa = 0; sa < resEntities.length; sa++){
      var ea = resEntities[sa];
      var ra = APH.Res.residentOf(ea);
      if(!ra || (ea.socialPauseT||0) > 0) continue;
      for(var sb = sa + 1; sb < resEntities.length; sb++){
        var eb = resEntities[sb];
        var rb = APH.Res.residentOf(eb);
        if(!rb || (eb.socialPauseT||0) > 0) continue;
        var dist = U.dst(ea.x, ea.y, eb.x, eb.y);
        if(dist >= 16 && dist < encR){
          var onDuty = !!(ra.job && rb.job);
          if(APH.Res.canSocialEncounter(ra, rb, s.socialCooldowns, nowSec, { raidActive: raid, dist: dist, onDuty: onDuty })){
            var enc = APH.Res.triggerSocialEncounter(ra, rb, s.meta.bonds, s.socialCooldowns, nowSec);
            if(enc){
              ea.socialPauseT = enc.duration || 1.5;
              eb.socialPauseT = enc.duration || 1.5;
              ea.socialBubble = enc.bubbleA;
              eb.socialBubble = enc.bubbleB;
              ea.face = Math.atan2(eb.y - ea.y, eb.x - ea.x);
              eb.face = Math.atan2(ea.y - eb.y, ea.x - eb.x);
              ea.walking = false;
              eb.walking = false;
              var col = enc.delta > 0 ? '#8fd4ff' : (enc.delta < 0 ? '#ff9a9a' : '#c8e89a');
              U.emit('notice', { text: enc.text, color: col });
              break;
            }
          }
        }
      }
    }

    var colonyRaid=raid;
    s.entities.forEach(function(e){
      if(!e || e.type!==T.RESIDENT) return;
      // 有完整房间庇护的非征召居民继续后勤；敌人入室或离开庇护立即避险。
      var raid=colonyRaid;
      if(raid&&s.colony.rulesVersion&&!e.drafted){
        var safeRoom=APH.Nav.roomAt(e,rooms,s.colony.scene);
        if(safeRoom&&!s.entities.some(function(en){return en&&en.type===T.ENEMY&&!en.dead&&!en.downed&&!en.isSoldier&&!en.retreat&&APH.Nav.roomAt(en,rooms,s.colony.scene)===safeRoom;}))raid=false;
      }
      e.hurtCd=Math.max(0,(e.hurtCd||0)-dt);
      if(e.hitFlash>0) e.hitFlash=Math.max(0,e.hitFlash-dt);
      var r=APH.Res.residentOf(e);
      /* 任务认领清理先于睡眠/倒地/社交的提前返回，物资不能被失能者永久锁住。 */
      if(r && APH.Logistics && (e.dead || r.downed || r.isSleeping || r.medLying || e.drafted || APH.Res.isBroken(r))){
        var releasedCargo=APH.Logistics.releaseCarrier(s.colony,r.id,e);
        (releasedCargo.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});
      }
      if(r&&(e.dead||r.downed||r.medLying))dropHaulCargo(s,e);
      /* ADR-22 社交停步中 */
      if((e.socialPauseT||0) > 0){
        e.socialPauseT -= dt;
        e.walking = false;
        if(e.socialPauseT <= 0){
          e.socialPauseT = 0;
          e.socialBubble = null;
        }
        return;
      }
      var walkCfg=CFG.walk||{};
      var sickSpeedMul=r && r.illness>walkCfg.sickAbove ? walkCfg.sickSpeedMul : 1;
      /* W3 天气室外减速: 房间内/避难所免罚; 寒潮+防寒服=免 */
      var wxMul=1;
      if(r && APH.Res && APH.Res.weatherMoveMul){
        wxMul=APH.Res.weatherMoveMul(r, resWxId, resWxSpeedMul,
          APH.Res.shelteredFor({x:e.x, y:e.y}, (s.colony&&s.colony.buildings)||[], rooms));
      }
      /* T10 沙袋: 居民穿过减速 ×sandbagMul (home 限定) */
      var bagMul=1;
      if(s.colony&&s.colony.buildings){
        var bagList=s.colony.buildings.filter(function(b){ return b.id==='bl_sandbag'; });
        if(bagList.length) bagMul=APH.Colony.sandbagMul(bagList, e);
      }
      /* B: 崩溃者不吃不搬不上岗; 出走型在院子里游荡, 其余原地停工 */
      /* #68: 睡着居民不进食、不搬运、不上岗、不走动(俯卧贴地) — 优先于破碎分支, 防破碎+wander 睡着仍游荡 */
      /* #69: 医疗舱俯卧者同短路(俯卧不滑行) */
      if(r && (r.isSleeping || r.medLying)){ e.walking = false; return; }
      /* #69 病重/击倒: 前往医疗舱床位俯卧 (轻病不躺, 仍慢走+✚) */
      if(r && !r.medLying && APH.Res.needsMedBed(r)){
        var clinic=(s.colony.buildings||[]).find(function(b){ return b.id==='bl_clinic'; });
        if(raid){
          /* raid 中: 击倒者必须原地俯卧(不能趴着爬回家/工作); 病重暂不强迫去床 */
          if(r.downed){ e.walking=false; return; }
        }else if(clinic){
          var bSpot=APH.Res.clinicBedSpot(clinic);
          e.tx=bSpot.x; e.ty=bSpot.y;
          var crawlMul=(CFG.residents&&CFG.residents.downedCrawlMul!=null)?CFG.residents.downedCrawlMul:0.5;
          APH.Res.walkAround(e, bSpot, dt, r.downed ? spd*crawlMul*wxMul*bagMul : spd*sickSpeedMul*wxMul*bagMul, navGrid);
          var bedArrive=(CFG.residents&&CFG.residents.clinicBedArriveR!=null)?CFG.residents.clinicBedArriveR:6;
          if(U.dst(e.x,e.y,bSpot.x,bSpot.y)<=bedArrive){
            r.medLying=true; e.medLying=true; e.walking=false;
            e.x=bSpot.x; e.y=bSpot.y;
            r.job=null; e.job=null;      /* 与 checkDowned 一致: 躺床撤岗 */
          }
          return;
        }
        if(r.downed){ e.walking=false; return; }   /* 无医疗舱: 击倒者原地俯卧(渲染已由 e.downed 接管) */
      }
      if(!raid && r && APH.Res.isBroken(r)){
        e.breaking=r.breakType;
        if(r.breakType==='wander'){
          var wanderSpd=((CFG.visitor&&CFG.visitor.speed)||48)*sickSpeedMul*wxMul;
          APH.Res.wanderStep(e,dt,CFG.HAB,(CFG.visitor&&CFG.visitor.yardR)||220,null,wanderSpd,observedNavGrid);
        }else{
          e.walking=false;
        }
        return;
      }
      e.breaking=null;
      /* ADR-29 战备征召中: 拔枪立正，不参与日常工作/游荡/进食 (右键战术指令优先) */
      if(e.drafted){
        e.fireCd = Math.max(0, (e.fireCd || 0) - dt);
        /* 自动索敌或集火开火 */
        var targetEn = null;
        if(e.userOrder && e.userOrder.type === 'attack' && e.userOrder.enemy && !e.userOrder.enemy.dead){
          targetEn = e.userOrder.enemy;
        } else {
          var aimR = (CFG.combat && (CFG.combat.plasmaSpeed*CFG.combat.plasmaLife)) || 240;
          targetEn = APH.Ent.findNearest(s.entities, T.ENEMY, e.x, e.y, aimR, function(en){
            return en && !en.dead && !en.isSoldier;
          });
        }
        if(targetEn){
          e.face = Math.atan2(targetEn.y - e.y, targetEn.x - e.x);
          if(e.fireCd <= 0){
            e.fireCd = 0.75;
            var pDmg = (CFG.combat && CFG.combat.plasmaDmg) || 15;
            var projSpd = 400;
            var proj = APH.Combat.makeProj(e.x, e.y - 12, Math.cos(e.face)*projSpd, Math.sin(e.face)*projSpd, 'player', pDmg);
            s.entities.push(proj);
            if(s.parts) s.parts.push({ t:'spark', x:e.x, y:e.y-12, life:0.15, max:0.15 });
          }
        }
        if(!e.userOrder || e.userOrder.type !== 'move'){
          e.walking = false;
          e.tx = e.x; e.ty = e.y;
          return;
        }
      }
      /* ADR-29 征召命令: 用户直接指令优先于一切自动行为 (失能者已在上方短路) */
      if(e.userOrder && e.userOrder.type){
        var uo=e.userOrder, C=CFG.command||{};
        var spdO=spd*sickSpeedMul*wxMul*bagMul;
        if(uo.type==='move'){
          if(U.dst(e.x,e.y,uo.x,uo.y)<=((C.moveArriveR!=null)?C.moveArriveR:8)){
            e.userOrder=null; e.walking=false; e.tx=e.x; e.ty=e.y;
          }else{
            e.tx=uo.x; e.ty=uo.y;
            APH.Res.walkAround(e, {x:uo.x,y:uo.y}, dt, spdO, navGrid);
          }
          return;
        }
        /* 袭击中只保留移动令 (手动撤离), 其余交还逃跑/战斗 AI */
        if(raid){ e.userOrder=null; }
        else if(uo.type==='gather'){
          var uFl=uo.flora;
          if(!uFl || uFl.dead || uFl.hp<=0){ e.userOrder=null; e.gathering=false; }
          else if(U.dst(e.x,e.y,uFl.x,uFl.y)<=((C.gatherArriveR!=null)?C.gatherArriveR:48)){
            var ugRes=APH.Colony.workOnFlora(uFl, r, dt);
            if(ugRes.locked){
              e.userOrder=null;e.gathering=false;
              if(s.designations)delete s.designations[uFl.id];
              return;
            }
            pulseGatherWork(uFl, e, dt);
            e.gathering=true; e.walking=false;
            if(ugRes.done && ugRes.dropItemId){
              APH.Combat.spawnDrop(uFl.x, uFl.y, ugRes.dropItemId, ugRes.dropCount, {stock:true});
              var ugName=(CFG.items[ugRes.dropItemId]&&CFG.items[ugRes.dropItemId].name)||ugRes.dropItemId;
              U.emit('notice', { text: (r?r.name:'居民')+' 完成 '+ugName+'×'+ugRes.dropCount, color: '#7dffab' });
              e.userOrder=null; e.gathering=false;
            }
          }else{
            e.gathering=false;
            e.tx=uFl.x; e.ty=uFl.y;
            APH.Res.walkAround(e, {x:uFl.x,y:uFl.y}, dt, spdO, navGrid);
          }
          return;
        }
        else if(uo.type==='equip'){
          var gearPile=uo.pile,gearItem=gearPile&&CFG.items[gearPile.itemId];
          if(!gearItem||!gearItem.slot||freeDropCount(s,gearPile)<1){e.userOrder=null;e.workReason='装备已被取走或预订';return;}
          if(U.dst(e.x,e.y,gearPile.x,gearPile.y)<=grabR){
            var previous=r.gear&&r.gear[gearItem.slot];
            if(APH.Colony.nibblePile(gearPile,1)!==1){e.userOrder=null;return;}APH.Colony.equipGear(r,gearPile.itemId);
            if(previous)APH.Combat.spawnDrop(e.x,e.y,previous,1,{stock:true,jitter:0});
            e.userOrder=null;e.workReason='已装备 '+gearItem.name;
            if(!s._background)U.emit('notice', { text: r.name+' 已装备 '+gearItem.name, color: '#9fe8c8' });
          }else{
            APH.Res.walkAround(e,gearPile,dt,spdO,navGrid);
            if(!e.walking)e.workReason='装备位置不可达';
          }
          return;
        }
        else if(uo.type==='haul'){
          if(!e.haulCarry){
            var uPile=uo.pile;
            if(!uPile || uPile.dead){ e.userOrder=null; }
            else if(U.dst(e.x,e.y,uPile.x,uPile.y)<=grabR){
              e.haulCarry=takeHaulPile(s,uPile);
              if(!e.haulCarry){e.userOrder=null;e.workReason='物资已被工单预订';return;}
              U.emit('notice', { text: (e.name||'居民')+' 拾起物资', color: '#8fd4ff' });
            }else{
              e.tx=uPile.x; e.ty=uPile.y;
              APH.Res.walkAround(e, {x:uPile.x,y:uPile.y}, dt, spdO, navGrid);
            }
            return;
          }
          /* 已抓取 → 送最近兼容仓储点入库 */
          var uSpot=storageDestination(s,e.haulCarry.itemId,e);
          if(!uSpot){e.workReason='仓储位置不可达';e.walking=false;return;}
          if(U.dst(e.x,e.y,uSpot.x,uSpot.y)<=dumpR){
            if(!storeCarried(s,e))return;
            U.emit('notice', { text: (e.name||'居民')+' 已将物资送入仓储', color: '#9fe8c8' });
            if(!e.haulCarry)e.userOrder=null;
          }else{
            e.tx=uSpot.x; e.ty=uSpot.y;
            APH.Res.walkAround(e, {x:uSpot.x,y:uSpot.y}, dt, spdO, navGrid);
          }
          return;
        }
        else if(uo.type==='sleep'){
          var uHouse=null, uHd=Infinity;
          (s.colony.buildings||[]).forEach(function(ub){
            if(ub.id!=='bl_house'||ub.dead) return;
            var ud=U.dst(e.x,e.y,ub.x,ub.y);
            if(ud<uHd){ uHd=ud; uHouse=ub; }
          });
          if(s.colony.rulesVersion===1){var ownBed=assignedHomeBed(r,s.colony.buildings);uHouse=ownBed&&APH.Construction.spot(s,ownBed,e);uHd=uHouse?U.dst(e.x,e.y,uHouse.x,uHouse.y):Infinity;}
          if(!uHouse){ e.userOrder=null; U.emit('notice', { text: '没有可达的床位', color: '#ff9a9a' }); }
          else if(uHd<=((C.sleepArriveR!=null)?C.sleepArriveR:40)){
            r.isSleeping=true; r.job=null; e.job=null; e.userOrder=null;
            U.emit('notice', { text: (e.name||'居民')+' 开始休息', color: '#b39dff' });
          }else{
            e.tx=uHouse.x; e.ty=uHouse.y;
            APH.Res.walkAround(e, {x:uHouse.x,y:uHouse.y}, dt, spdO, navGrid);
          }
          return;
        }
        else if(uo.type==='eat'){
          var ate=tryEatHere(e, r, grabR, dumpR);
          if(ate || !APH.Colony.nearestMeal(e, 1e9)){ e.userOrder=null; }
          else{
            var um=APH.Colony.nearestMeal(e, 1e9);
            e.tx=um.x; e.ty=um.y;
            APH.Res.walkAround(e, {x:um.x,y:um.y}, dt, spdO, navGrid);
          }
          return;
        }
        else if(uo.type==='build'){
          var bx=uo.x, by=uo.y;
          if(bx==null){
            var nbp=nearestBlueprint(e.x,e.y);
            if(nbp){ bx=nbp.x; by=nbp.y; }
          }
          var forcedPlan=(s.colony.buildQueue||[]).find(function(q){return q.x===bx&&q.y===by;});
          if(forcedPlan&&forcedPlan.geometryVersion===1){
            if(moveConstructionMaterials(s,e,r,dt,spdO,navGrid))return;
            var forcedSpot=APH.Construction.spot(s,forcedPlan,e);
            if(forcedSpot)APH.Res.walkAround(e,forcedSpot,dt,spdO,navGrid);
            else {e.walking=false;e.workReason='工地入口被堵住';}
            return;
          }
          if(bx==null){ e.userOrder=null; }
          else if(U.dst(e.x,e.y,bx,by)<90){
            e.walking=false; e.tx=e.x; e.ty=e.y;
          }else{
            e.tx=bx; e.ty=by;
            APH.Res.walkAround(e, {x:bx,y:by}, dt, spdO, navGrid);
          }
          return;
        }
        else { e.userOrder=null; }
      }
      if(r&&!raid&&moveConstructionMaterials(s,e,r,dt,spd*sickSpeedMul*wxMul*bagMul,navGrid))return;
      /* ADR-29 征召待命: 被选中但无命令 → 不上岗不游荡 (饥饿/困倦仍放行安全网) */
      if(!raid && e.drafted && s.selectedRid && (e.rid||e.id)===s.selectedRid){
        var rHungry = r && r.food!=null && r.food<eatBelow;
        var rSleepy = r && r.wantSleep && !r.isSleeping;
        if(!rHungry && !rSleepy){ e.walking=false; e.tx=e.x; e.ty=e.y; return; }
      }
      /* ADR-30 / #168: 与指挥官同一套 thinkPawn */
      if(!raid && r && !e.drafted && APH.Res && APH.Res.thinkPawn){
        var wp = (m.workPrio && m.workPrio[r.id]) || {};
        var mealN = APH.Colony.nearestMeal(e, 1e9);
        var houseN=null, houseND=Infinity;
        (s.colony.buildings||[]).forEach(function(hb){
          if(!hb || hb.dead || hb.id!=='bl_house') return;
          var dH=U.dst(e.x,e.y,hb.x,hb.y);
          if(dH<houseND){ houseND=dH; houseN=hb; }
        });
        var assignedBed=assignedHomeBed(r,s.colony.buildings);
        if(assignedBed){houseN=APH.Construction.spot(s,assignedBed,e);houseND=houseN?U.dst(e.x,e.y,houseN.x,houseN.y):Infinity;}
        else if(s.colony.rulesVersion){houseN=null;houseND=Infinity;}
        var sleepArrive=(CFG.command&&CFG.command.sleepArriveR!=null)?CFG.command.sleepArriveR:40;
        var spdMul=spd*sickSpeedMul*wxMul*bagMul*((APH.Res.partsMoveMul&&APH.Res.partsMoveMul(r))||1);
        var rpawn={
          id:r.id, x:e.x, y:e.y, drafted:!!e.drafted,
          food:r.food, rest:r.rest, recreation:r.recreation,
          schedule: r.schedule,
          wantSleep:!!r.wantSleep, isSleeping:!!r.isSleeping, downed:!!r.downed, medLying:!!r.medLying,
          prio:{
            sk_gather: wp.sk_gather!=null?wp.sk_gather:2,
            sk_build: wp.sk_build!=null?wp.sk_build:2,
            sk_haul: wp.sk_haul!=null?wp.sk_haul:2
          },
          order:null, haulCarry:e.haulCarry,
          nearFood: !!(mealN && U.dst(e.x,e.y,mealN.x,mealN.y)<=grabR)||(Array.isArray(e.haulCarry)?e.haulCarry:(e.haulCarry?[e.haulCarry]:[])).some(function(p){return dropStore(p)==='food';}),
          nearBed: !!(houseN && houseND<=sleepArrive),
          job: e.job || r.job,
          gathering: !!e.gathering
        };
        var intent=APH.Res.thinkPawn(rpawn, pawnWorldAt(e.x, e.y, e.haulCarry, r));
        e.workAnim = (intent.type==='build') ? 'build' : ((intent.type==='haul'||intent.type==='haul_dump') ? 'haul' : ((intent.type==='job' && (e.job==='bl_kitchen'||r.job==='bl_kitchen')) ? 'cook' : null));
        var handled=true;
        if(intent.type==='none'){ e.walking=false; }
        else if(intent.type==='eat_now' || intent.type==='eat'){
          var seat=seatMap[r.id]||null;
          if(seat && seat.chair){
            if(s.colony.rulesVersion===1){
              var carriedMeals=Array.isArray(e.haulCarry)?e.haulCarry:(e.haulCarry?[e.haulCarry]:[]);
              if(!carriedMeals.some(function(p){return dropStore(p)==='food';})){
                var fetchMeal=APH.Colony.nearestMeal(e,Infinity);
                if(!fetchMeal){e.workReason='没有可取用的食物';e.walking=false;return;}
                if(U.dst(e.x,e.y,fetchMeal.x,fetchMeal.y)>grabR){
                  e.workReason='先取餐，再去餐位';APH.Res.walkAround(e,fetchMeal,dt,spdMul,navGrid);return;
                }
                var mealId=fetchMeal.kind==='stock'?'it_food':fetchMeal.drop.itemId;
                var gotMeal=fetchMeal.kind==='stock'?APH.Colony.takeStock(s.meta.res,[],'food',1).ok:
                  (freeDropCount(s,fetchMeal.drop)>0&&APH.Colony.nibblePile(fetchMeal.drop,1)===1);
                if(!gotMeal){e.workReason='食物已被取走或预订';return;}
                carriedMeals.push({itemId:mealId,n:1});e.haulCarry=carriedMeals;
              }
            }
            var seatSpot=seat.chair.geometryVersion===1?APH.Construction.spot(s,seat.chair,e):{x:seat.chair.x+8,y:seat.chair.y-2};
            if(!seatSpot){e.workReason="餐位入口被堵住";e.walking=false;return;}
            var seatX=seatSpot.x, seatY=seatSpot.y;
            var dSeat=U.dst(e.x,e.y,seatX,seatY);
            if(dSeat>((CFG.residents&&CFG.residents.diningArriveR!=null)?CFG.residents.diningArriveR:6)){
              e.tx=seatX; e.ty=seatY;
              APH.Res.walkAround(e, {x:seatX,y:seatY}, dt, spdMul, navGrid);
              if(APH.Res.faceTable && U.dst(e.x,e.y,seatX,seatY)<=10) e.face=APH.Res.faceTable(seat.chair, seat.table);
            }else{
              e.x=seatX; e.y=seatY; e.walking=false;
              e.face=APH.Res.faceTable(seat.chair, seat.table);
              tryEatHere(e, r, grabR, dumpR, true, ((CFG.residents&&CFG.residents.diningTableEatR!=null)?CFG.residents.diningTableEatR:90));
            }
          }else if(intent.type==='eat_now'){
            tryEatHere(e, r, grabR, dumpR);
            e.walking=false;
          }else{
            e.tx=intent.x; e.ty=intent.y;
            APH.Res.walkAround(e, {x:intent.x,y:intent.y}, dt, spdMul, navGrid);
          }
        }else if(intent.type==='sleep_now'){
          r.isSleeping=true; e.isSleeping=true; e.walking=false;
          if(intent.bed && houseN){ e.x=houseN.x; e.y=houseN.y; }
          if(assignedBed&&assignedBed.geometryVersion===1){var sr=APH.BuildGrid.rectOf(assignedBed);e.sleepAnchor={x:sr.x+sr.w/2,y:sr.y+sr.h/2};}
        }else if(intent.type==='sleep'){
          e.tx=intent.x; e.ty=intent.y;
          APH.Res.walkAround(e, {x:e.tx,y:e.ty}, dt, spdMul, navGrid);
        }else if(intent.type==='build'){
          var plannedBuild=(s.colony.buildQueue||[]).find(function(q){return q.x===intent.x&&q.y===intent.y;});
          if(plannedBuild&&plannedBuild.geometryVersion===1){
            var buildSpot=APH.Construction.spot(s,plannedBuild,e);
            if(buildSpot)APH.Res.walkAround(e,buildSpot,dt,spdMul,navGrid);else {e.walking=false;e.workReason='工地入口被堵住';}
          }else if(U.dst(e.x,e.y,intent.x,intent.y)<90){ e.walking=false; e.tx=e.x; e.ty=e.y; }
          else { e.tx=intent.x; e.ty=intent.y; APH.Res.walkAround(e, {x:e.tx,y:e.ty}, dt, spdMul, navGrid); }
        }else if(intent.type==='haul_dump'){
          if(U.dst(e.x,e.y,intent.x,intent.y)<=dumpR){
            if(e.haulCarry){
              if(!storeCarried(s,e)){e.walking=false;return;}
              U.emit('notice', { text: (e.name||'居民')+' 已将物资送入仓储', color: '#9fe8c8' });
            }
            e.walking=false;
          }else{
            e.tx=intent.x; e.ty=intent.y;
            APH.Res.walkAround(e, {x:e.tx,y:e.ty}, dt, spdMul, navGrid);
          }
        }else if(intent.type==='haul'){
          var hDrop=intent.drop;
          if(hDrop && U.dst(e.x,e.y,hDrop.x,hDrop.y)<=grabR){
            e.haulCarry=takeHaulPile(s,hDrop);
            U.emit('notice', { text: (e.name||'居民')+' 拾起物资', color: '#8fd4ff' });
          }else{
            e.tx=intent.x; e.ty=intent.y;
            APH.Res.walkAround(e, {x:e.tx,y:e.ty}, dt, spdMul, navGrid);
          }
        }else if(intent.type==='clean'){
          if(U.dst(e.x,e.y,intent.x,intent.y)<28){
            e.walking=false; e.workAnim='haul';
            s.colony.filth=APH.Colony.cleanCells(s.colony.filth||{}, [{x:intent.x,y:intent.y}], 18);
          }else{
            e.tx=intent.x; e.ty=intent.y;
            APH.Res.walkAround(e, {x:intent.x,y:intent.y}, dt, spdMul, navGrid);
          }
        }else if(intent.type==='hunt'){
          var an=intent.animal;
          if(!an || an.dead) e.workAnim=null;
          else if(U.dst(e.x,e.y,an.x,an.y)<36){
            e.walking=false; e.workAnim='gather';
            var hr=APH.Colony.workOnAnimal?APH.Colony.workOnAnimal(an, dt):{done:false};
            if(hr.done && hr.dropItemId){
              APH.Combat.spawnDrop(an.x, an.y, hr.dropItemId, hr.dropCount||1, {stock:true});
              if(s.designations) delete s.designations[an.id];
              U.emit('notice', { text: (r&&r.name||'居民')+' 猎获', color: '#c8e89a' });
            }
          }else{
            e.tx=an.x; e.ty=an.y;
            APH.Res.walkAround(e, {x:an.x,y:an.y}, dt, spdMul, navGrid);
          }
        }else if(intent.type==='gather'){
          var gt=intent.flora || e.gatherTarget;
          if(intent.emergency && gt){
            s.designations=s.designations||{};
            if(!s.designations[gt.id]) s.designations[gt.id]={ type:'chop', entityId:gt.id };
          }
          e.gatherTarget=gt;
          if(!gt || gt.dead || gt.hp<=0){ e.gatherTarget=null; e.gathering=false; }
          else if(U.dst(e.x,e.y,gt.x,gt.y)<48){
            var gRes=APH.Colony.workOnFlora(gt, r, dt);
            if(gRes.locked){
              e.gatherTarget=null;e.gathering=false;
              if(s.designations)delete s.designations[gt.id];
              return;
            }
            pulseGatherWork(gt, e, dt);
            e.gathering=true; e.walking=false;
            if(gRes.done && gRes.dropItemId){
              APH.Combat.spawnDrop(gt.x, gt.y, gRes.dropItemId, gRes.dropCount, {stock:true});
              var gName=(CFG.items[gRes.dropItemId]&&CFG.items[gRes.dropItemId].name)||gRes.dropItemId;
              U.emit('notice', { text: (r?r.name:'居民')+' 采集完成 +'+gRes.dropCount+' '+gName, color: '#c8e89a' });
              e.gatherTarget=null; e.gathering=false;
              if(s.designations) delete s.designations[gt.id];
            }
          }else{
            e.gathering=false; e.tx=gt.x; e.ty=gt.y;
            APH.Res.walkAround(e, {x:gt.x,y:gt.y}, dt, spdMul, navGrid);
          }
        }else if(intent.type==='joy'){
          tryResidentJoy(e, r, dt, spdMul, navGrid);
        }else if(intent.type==='job'){
          if(s.colony.rulesVersion){
            var stations=(s.colony.buildings||[]).filter(function(b){return b&&!b.dead&&(b.id===(e.job||r.job)||((e.job||r.job)==='bl_kitchen'&&b.id==='bl_campfire'));});
            var station=stations.find(function(b){return b.uid===r.workBuildingUid;});
            if(!station)station=stations.find(function(b){return !(m.residents||[]).some(function(other){return other!==r&&other.workBuildingUid===b.uid;});})||stations[0];
            var workSpot=station&&APH.Construction.spot(s,station,e);
            if(workSpot){r.workBuildingUid=station.uid;e.workReason='前往'+APH.Colony.get(station.id).name;APH.Res.walkAround(e,workSpot,dt,spdMul,navGrid);if(U.dst(e.x,e.y,workSpot.x,workSpot.y)<=8)e.workReason=station.workReason||'已到工位';}
            else {e.workReason='工位入口被堵住';e.walking=false;}
          }else handled=false;
        }else if(intent.type==='idle'){
          if(!s.selectedRid || (e.rid||e.id)!==s.selectedRid){residentIdleStroll(e, dt);APH.Res.walkAround(e,{x:e.tx,y:e.ty},dt,spdMul,navGrid);}
          else { e.walking=false; e.tx=e.x; e.ty=e.y; }
        }
        if(handled){
          /* fall through to traps + walkAround for leftover tx */
        } else {
          /* 工位微巡视 */
          if(!e.userOrder && (!s.selectedRid || (e.rid||e.id)!==s.selectedRid)){
            e.workPaceT=(e.workPaceT||0)-dt;
            if(e.workPaceT<=0){
              e.workPaceT=U.rr(3.5, 6.0);
              var bld=(s.colony&&s.colony.buildings||[]).find(function(b){ return b.id===e.job||(e.job==='bl_kitchen'&&b.id==='bl_campfire'); });
              if(bld){
                var pace=(CFG.idle&&CFG.idle.workPace!=null)?CFG.idle.workPace:28;
                e.tx=bld.x+16+U.rr(-pace,pace);
                e.ty=bld.y+20+U.rr(-pace*0.7, pace*0.7);
              }
            }
          }
          if((wp.sk_haul!=null?wp.sk_haul:2)>0){
            var nearDrop=nearestDrop(e, H.pickR!=null?H.pickR:52);
            if(nearDrop){
              e.tx=nearDrop.x; e.ty=nearDrop.y;
              if(U.dst(e.x,e.y,nearDrop.x,nearDrop.y)<grabR){
                e.haulCarry=takeHaulPile(s,nearDrop);
              }
            }
          }
        }
      }
      /* T10 陷阱重置: 居民路过已触发陷阱(armed=false) → 耗建材自动复位 */
      if(!raid && r && !r.isBroken && !r.isSleeping && !r.medLying && (s.colony&&s.colony.buildings)){
        var tblds=s.colony.buildings.filter(function(b){ return b.id==='bl_spike_trap' && b.armed===false; });
        if(tblds.length){
          for(var ti=0;ti<tblds.length;ti++){
            var tt=tblds[ti];
            if(U.dst(e.x,e.y,tt.x,tt.y) < 40){
              var rc=(CFG.defense&&CFG.defense.trapResetCost)||{stone:1};
              var haveAll=true;
              for(var rk in rc){ if(APH.Colony.haveStock(rk) < rc[rk]){ haveAll=false; break; } }
              if(haveAll){
                for(var rk2 in rc){if(!APH.Colony.takeStock(s.meta.res,s.entities,rk2,rc[rk2]).ok){haveAll=false;break;}}
                if(!haveAll)break;
                tt.armed=true; tt.cd=0;
                U.emit('notice', { text: (e.name||'居民')+' 重置了尖刺陷阱', color: '#9fe8c8' });
              }
              break;
            }
          }
        }
      }
      // thinkPawn 的处理分支已经移动过，本帧不能再沿旧 tx/ty 折返一次。
      if(!handled)APH.Res.walkAround(e, {x:e.tx, y:e.ty}, dt, spd*sickSpeedMul*wxMul*bagMul, navGrid);
    });
  }
  return { update: update, syncResidentEntities: syncResidentEntities,
           tryResidentJoy: tryResidentJoy, nearestDrop: nearestDrop, freeDropCount: freeDropCount };
})();
