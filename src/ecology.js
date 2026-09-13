/* ============================================================
   Aphelion · ecology.js — 新家园野生动物（纯世界侧行为）
   仅 generation=1 home；动物仍是统一 entities[] 的 animal。
   主循环负责在新地图建立/恢复后调用 seed，并在 home tick 调用 tick。
   ============================================================ */
window.APH = window.APH || {};

APH.Ecology = (function(){
  'use strict';
  var CFG=APH.CFG, U=APH.U, T=CFG.entType;
  function settings(){ return CFG.ecology||{}; }
  function sceneOf(s){ return s&&s.colony&&s.colony.scene; }
  function modernHome(s){ var scene=sceneOf(s), TM=APH.TerrainModel; return !!(s&&s.scene==='home'&&TM&&scene&&TM.normalize(scene).generation===1); }
  function hash(seed,a,b){ var h=(seed>>>0)^Math.imul((a|0)+0x9e3779b9,0x85ebca6b)^Math.imul((b|0)+0xc2b2ae35,0x27d4eb2f);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0; }
  function unit(seed,a,b){ return hash(seed,a,b)/4294967296; }
  function animalId(scene,gx,gy){ return 'eco_'+scene.seed+'_'+gx+'_'+gy; }
  function usable(scene,gx,gy){ var c=APH.TerrainModel.cellAt(scene,(gx+.5)*scene.grid,(gy+.5)*scene.grid);return c.walkable&&(c.region==='woodland'||c.region==='ridge'); }
  function seed(s){
    if(!modernHome(s)) return [];
    var scene=sceneOf(s), E=s.entities||(s.entities=[]), C=settings(), found=[];
    var cols=Math.ceil(scene.width/scene.grid), rows=Math.ceil(scene.height/scene.grid), want=C.count;
    var existing={}, present=0, prefix='eco_'+scene.seed+'_';
    E.forEach(function(e){if(e&&e.id){existing[e.id]=true;if(e.wild&&e.id.indexOf(prefix)===0)present++;}});
    want=Math.max(0,want-present);
    for(var attempt=0;found.length<want&&attempt<C.spawnSearch;attempt++){
      var gx=Math.floor(unit(scene.seed,attempt,17)*cols), gy=Math.floor(unit(scene.seed,attempt,29)*rows);
      if(!usable(scene,gx,gy))continue;
      var x=(gx+.5)*scene.grid,y=(gy+.5)*scene.grid;
      if(U.dst(x,y,CFG.HAB.x,CFG.HAB.y)<C.spawnMinHab)continue;
      var id=animalId(scene,gx,gy);if(existing[id])continue;
      var region=APH.TerrainModel.cellAt(scene,x,y).region;
      var e={id:id,type:T.ANIMAL||'animal',kind:region==='ridge'?'ridge_guard':'grazer',wild:true,x:x,y:y,
        hp:C.hp||20,maxHp:C.hp||20,warning:false,warningT:0,attackCd:0,feedCd:0,wanderT:0};
      E.push(e);existing[id]=true;found.push(e);
    }
    return found;
  }
  function residents(s){return (s.entities||[]).filter(function(e){return e&&e.type===T.RESIDENT&&!e.dead&&!e.downed;});}
  function nearest(list,e,max){var best=null,bd=max;list.forEach(function(x){var d=U.dst(e.x,e.y,x.x,x.y);if(d<bd){best=x;bd=d;}});return best;}
  function farms(s){return (s.colony.buildings||[]).filter(function(b){return b&&!b.dead&&(b.id==='bl_farm'||b.id==='bl_crop_plot')&&b.plot;});}
  function foreground(s){return !s._background;}
  function flee(e, who, dt, grid){var C=settings(), dx=e.x-who.x,dy=e.y-who.y,l=Math.sqrt(dx*dx+dy*dy)||1;APH.Res.walkAround(e,{x:e.x+dx/l*C.fleeRange,y:e.y+dy/l*C.fleeRange},dt,C.speed,grid);e.workReason='避开居民';}
  function graze(e, s, dt, grid){
    var C=settings(), farm=nearest(farms(s),e,C.forageRadius);
    if(!farm)return false;
    if(U.dst(e.x,e.y,farm.x,farm.y)>C.forageRadius/3){APH.Res.walkAround(e,farm,dt,C.speed,grid);e.workReason='觅食中';return true;}
    if(e.feedCd>0)return true;
    if((farm.plot.stage||0)>=3){farm.plot.stage=2;farm.plot.t=0;}
    else farm.plot.t=Math.max(0,(farm.plot.t||0)-C.feedProgress);
    e.feedCd=C.feedCooldown;e.workReason='啃食农作物';return true;
  }
  function wander(e,s,dt,grid){
    var C=settings();e.wanderT=(e.wanderT||0)-dt;
    if(e.wanderT<=0){var a=unit(sceneOf(s).seed,Math.floor((s.clock||0)/C.wanderSeconds),hash(sceneOf(s).seed,e.x,e.y))*Math.PI*2;e.wanderTarget={x:e.x+Math.cos(a)*C.wanderRange,y:e.y+Math.sin(a)*C.wanderRange};e.wanderT=C.wanderSeconds;}
    if(e.wanderTarget)APH.Res.walkAround(e,e.wanderTarget,dt,C.speed,grid);
  }
  function guard(e,s,near,dt,grid){
    var C=settings();
    if(!near){e.warning=false;e.warningT=0;wander(e,s,dt,grid);return;}
    if(!e.warning){e.warning=true;e.warningT=C.guardWarningSeconds;e.workReason='岩丘护域警告';if(foreground(s))U.emit('notice',{text:'⚠ 岩丘护域者发出警告',color:'#ffc857'});return;}
    if(e.warningT>0)return;
    if(e.attackCd<=0&&U.dst(e.x,e.y,near.x,near.y)<=C.guardAttackRadius){
      var r=(s.meta&&s.meta.residents||[]).find(function(x){return x.id===(near.rid||near.id);});
      if(r)APH.Res.hurtResident(r,C.guardDamage,'wound');
      near.workReason='被岩丘护域者驱离';e.attackCd=C.guardCooldown;e.workReason='驱离入侵者';
      if(foreground(s))U.emit('notice',{text:'⚠ 岩丘护域者驱离居民',color:'#ff9a9a'});
    }
    flee(e,near,dt,grid);
  }
  function exposedAt(s,position){
    if(!modernHome(s)||!position)return false;
    return (s.entities||[]).some(function(e){return e&&!e.dead&&e.exposureRisk&&
      U.dst(e.x,e.y,position.x,position.y)<=settings().alienExposureRadius;});
  }
  function tick(s,dt){
    if(!modernHome(s))return false;
    var C=settings(), scene=sceneOf(s), grid=APH.Nav.gridOf(s.colony.buildings||[],scene), rs=residents(s);
    (s.entities||[]).filter(function(e){return e&&e.type===T.ANIMAL&&e.wild&&!e.dead;}).forEach(function(e){
      e.feedCd=Math.max(0,(e.feedCd||0)-dt);e.attackCd=Math.max(0,(e.attackCd||0)-dt);e.warningT=Math.max(0,(e.warningT||0)-dt);
      var near=nearest(rs,e,e.kind==='ridge_guard'?C.guardWarningRadius:C.fleeRadius);
      if(e.kind==='ridge_guard')guard(e,s,near,dt,grid);
      else if(near)flee(e,near,dt,grid);
      else if(!graze(e,s,dt,grid))wander(e,s,dt,grid);
    });
    return true;
  }
  return {seed:seed,tick:tick,exposedAt:exposedAt};
})();
