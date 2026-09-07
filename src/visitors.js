/* ============================================================
   Aphelion · visitors.js — 过客拜访 · 请客 · 招募 (ADR-43)
   挂载: window.APH.Visitors
   职责: 流浪者何时出现、在家园怎么逛、印象怎么涨、[F] 请客、[E] 招募,
         以及第一夜那位由开场闸门放进来的访客。
   对视图零依赖: 要说话就 U.emit('notice'/'hint'), 由 ui 订阅 (ADR-40)。
   招募成功后只发 rosterChanged —— 世界侧实体池归 main 管。
   ============================================================ */
window.APH = window.APH || {};

APH.Visitors = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;

  function count(){
    return APH.Ent.findAll(APH.state.entities, T.VISITOR).length;
  }
  function nearest(s){
    var r=(CFG.visitor && CFG.visitor.recruitR)||54;
    return APH.Ent.findNearest(s.entities, T.VISITOR, s.px, s.py, r);
  }
  function nearestResident(s){
    var r=(CFG.visitor && CFG.visitor.recruitR)||54;
    return APH.Ent.findNearest(s.entities, T.RESIDENT, s.px, s.py, r);
  }
  function spawn(at, over){
    var s=APH.state;
    s.meta.residentSeq=(s.meta.residentSeq||0)+1;
    var taken=(s.meta.residents||[]).map(function(x){return x.name;});
    (s.entities||[]).forEach(function(e){
      if(e.type===T.VISITOR && e.profile && e.profile.name) taken.push(e.profile.name);
    });
    var profile=APH.Res.generate('v'+s.meta.residentSeq+'_'+(Date.now()%10000),
      ((s.seed||7)*31+s.meta.residentSeq*917)>>>0, taken);
    if(over) Object.assign(profile, over);
    profile.arrivedAt=s.clock||0;
    APH.Res.enrichBio(profile);
    var ang=Math.random()*U.TAU;
    var rad=140+Math.random()*50;
    var x=at&&at.x!=null ? at.x : CFG.HAB.x+Math.cos(ang)*rad;
    var y=at&&at.y!=null ? at.y : CFG.HAB.y+Math.sin(ang)*rad;
    y=Math.max(40, y);
    var stay=(CFG.visitor.stayMin||50)+Math.random()*((CFG.visitor.stayMax||90)-(CFG.visitor.stayMin||50));
    var ent={
      id:profile.id, type:T.VISITOR, x:x, y:y,
      name:profile.name, profile:profile,
      wanderA:ang+Math.PI, wanderT:0.2, stayT:stay, askCd:0,
      impression:(CFG.recruit&&CFG.recruit.impressStart)||50, fed:false,
      face:ang+Math.PI, walkPh:0, walking:true, wanderIdle:false
    };
    /* C: 游商随身带一份 seeded 货单 */
    if(APH.Res.joinIntentOf(profile)==='trader'){
      ent.trade=APH.Res.makeTraderStock(((s.seed||7)*131 + (s.meta.residentSeq||0)*977)>>>0);
    }
    s.entities.push(ent);
    U.emit('notice', {text:'过客 '+profile.name+' 来拜访了', color:'#8fd4ff'});
    U.emit('visitorArrived', profile);
    return ent;
  }
  function firstNightOpening(){
    var s=APH.state;
    if(!s.meta) s.meta={};
    if(!s.meta.opening){
      s.meta.opening = (window.APH.Opening && APH.Opening.defaults)
        ? APH.Opening.defaults(false)
        : { played:false, nightDone:false, sleptInHouse:false, houseAt:null, firstVisitor:false };
    }
    return s.meta.opening;
  }
  function applyFirstNightHint(){
    if(!window.APH.Opening || !APH.Opening.objective) return;
    var s=APH.state;
    var o=APH.Opening.objective(firstNightOpening(), (s.colony&&s.colony.buildings)||[]);
    if(o) U.emit('hint', {text:o.text});
  }
  function tryFirstNight(){
    var s=APH.state;
    if(s.scene!=='home') return null;
    if(!window.APH.Opening || !APH.Opening.visitorAllowed){
      return maybeSpawn(false);
    }
    var op=firstNightOpening();
    var b=(s.colony&&s.colony.buildings)||[];
    if(!APH.Opening.visitorAllowed(op, b, s.clock||0)) return null;
    if(!op.firstVisitor){
      if(count()===0) spawn();
      op.firstVisitor=true;
      try{ APH.Save.saveMeta(s.meta); }catch(eF){}
      return true;
    }
    return maybeSpawn(false);
  }
  function maybeSpawn(force){
    var s=APH.state;
    if(s.scene!=='home') return null;
    if(window.APH.Opening && APH.Opening.visitorAllowed &&
       !APH.Opening.visitorAllowed(firstNightOpening(), (s.colony&&s.colony.buildings)||[], s.clock||0))
      return null;
    var max=(CFG.visitor && CFG.visitor.max)||2;
    if(count()>=max) return null;
    if(!force && Math.random()>(CFG.visitor.arriveChance||0.45)) return null;
    return spawn();
  }
  function offerMealToResident(ent){
    var s=APH.state;
    if(!ent || ent.dead) return false;
    var r = APH.Res.residentOf(ent);
    if(!r) return false;
    var need = (CFG.recruit && CFG.recruit.mealCost) || 2;
    if(APH.Colony.haveStock('food') < need){
      U.emit('notice', {text:'✕ 粮食不足，无法请客', color:'#ff9a9a'});
      return false;
    }
    APH.Colony.takeStock(s.meta.res, s.entities, 'food', need);
    APH.Res.applyBond(s.meta.bonds || (s.meta.bonds={}), 'player', r.id, 8);
    r.mood = Math.min(100, (r.mood || 70) + 12);
    ent.socialBubble = '❤️';
    var pe = APH.Ent.findPlayer();
    if(pe) pe.socialBubble = '😊';
    U.emit('notice', {text:'请 ' + r.name + ' 吃了顿便饭 (-' + need + '粮 · +好感 +心情)', color:'#ffd54f'});
    APH.Save.metaQuiet();
    return true;
  }

  function offerMeal(ent){
    var s=APH.state;
    if(!ent || ent.dead) return false;
    if(ent.fed){
      U.emit('notice', {text:'✕ 已经请过客吃过了', color:'#ff9a9a'});
      return false;
    }
    var cookedDrop = (s.entities||[]).find(function(e){
      return e && !e.dead && e.type===T.DROPPED && CFG.items[e.itemId] && CFG.items[e.itemId].isCooked && (e.n||1)>0;
    });
    var isCooked = false;
    var need = (CFG.recruit&&CFG.recruit.mealCost)||2;
    if(cookedDrop){
      isCooked = true;
      need = 0;
      APH.Colony.nibblePile(cookedDrop, 1);
    }else{
      if(!APH.Colony.ensureStock(s.meta.res, s.entities, 'food', need)){
        U.emit('notice', {text:'✕ 食物不够请客', color:'#ff9a9a'});
        return false;
      }
    }
    var r=APH.Res.offerMeal(s.meta, ent, need, isCooked);
    if(!r.ok){
      U.emit('notice', {text:'✕ '+r.why, color:'#ff9a9a'});
      return false;
    }
    APH.Save.metaQuiet();
    var msg = isCooked ? '🍲 用精制熟食款待了 ' + (ent.name||'过客') + ' (印象+35 → ' + Math.round(r.impression) + ')'
                       : '🍲 请 ' + (ent.name||'过客') + ' 吃了一顿 (印象+' + (r.boost||20) + ' → ' + Math.round(r.impression) + ')';
    U.emit('notice', {text:msg, color:'#ffca28'});
    return true;
  }
  function tryRecruit(ent, rng){
    var s=APH.state;
    if(!ent || ent.dead) return false;
    if((ent.askCd||0)>0){
      U.emit('notice', {text:(ent.name||'过客')+' 还想再看看', color:'#8fa3cc'});
      return false;
    }
    var profile=ent.profile||ent;
    var ctx=APH.Res.recruitCtx(ent);
    var r=APH.Res.attemptRecruit(s.meta, profile, ctx, rng);
    if(!r.ok){
      if(r.why==='还想再看看'){
        ent.askCd=(CFG.recruit&&CFG.recruit.askCd)||15;
        U.emit('notice', {text:(profile.name||'过客')+' 还想再看看', color:'#8fa3cc'});
      }else{
        U.emit('notice', {text:'✕ '+r.why, color:'#ff9a9a'});
      }
      return false;
    }
    APH.Ent.destroy(ent);
    var sx=ent.x, sy=ent.y, rid=r.resident.id;
    s.entities=APH.Ent.sweepDead(s.entities);
    APH.Res.enrichBio(r.resident);
    APH.Save.metaQuiet();
    /* ADR-43: 名册变了 —— 世界侧实体的同步归 main(它管实体池), 这里只报信。 */
    U.emit('rosterChanged', {});
    s.entities.forEach(function(e){
      if(e.type===T.RESIDENT && (e.rid===rid || e.id===rid)){ e.x=sx; e.y=sy; }
    });
    var skName=APH.Res.SKILL_NAMES[r.resident.mainSkill];
    U.emit('notice', {text:'🤝 '+r.resident.name+' 加入了殖民地'+(skName?' ('+skName+'专精)':''), color:'#9fe8c8'});
    var pop=(s.meta.residents||[]).length;
    var days=pop ? Math.floor(APH.Colony.haveStock('food')/Math.max(1,pop)) : 0;
    if(days<3) U.emit('notice', {text:'⚠ 招了之后食物大约还能撑'+days+'跳', color:'#ffc857'});
    U.emit('residentJoined', r.resident);
    return true;
  }
  function update(dt){
    var s=APH.state;
    if(s.scene!=='home') return;
    var yard=(CFG.visitor && CFG.visitor.yardR)||220;
    s.entities.forEach(function(e){
      if(!e || e.type!==T.VISITOR || e.dead) return;
      e.stayT=(e.stayT||0)-dt;
      if(e.askCd>0) e.askCd=Math.max(0, e.askCd-dt);
      if(e.stayT>0){
        e.impression=APH.Res.tickImpression(e.impression, dt, APH.Res.recruitCtx(e));
      }
      if(e.stayT<=0){
        var dx=e.x-CFG.HAB.x, dy=e.y-CFG.HAB.y;
        var d=Math.sqrt(dx*dx+dy*dy)||1;
        e.x+=dx/d*90*dt; e.y+=dy/d*90*dt;
        e.walking=true; e.wanderIdle=false;
        e.face=Math.atan2(dy, dx);
        APH.Res.bumpWalkPh(e, dt);
        if(d>yard+90){
          e.dead=true;
          U.emit('notice', {text:(e.name||'过客')+' 上路了', color:'#5d6f96'});
        }
        return;
      }
      APH.Res.wanderStep(e, dt, CFG.HAB, yard);
    });
    s.entities=APH.Ent.sweepDead(s.entities);
  }

  return {
    count:count, nearest:nearest, nearestResident:nearestResident,
    spawn:spawn, maybeSpawn:maybeSpawn,
    firstNightOpening:firstNightOpening, applyFirstNightHint:applyFirstNightHint,
    tryFirstNight:tryFirstNight,
    offerMealToResident:offerMealToResident, offerMeal:offerMeal,
    tryRecruit:tryRecruit, update:update,
  };
})();
