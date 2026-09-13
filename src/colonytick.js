/* ============================================================
   Aphelion · colonytick.js — 30 秒生产跳 (ADR-42)
   挂载: window.APH.ColonyTick
   职责: 殖民地这一跳里发生的一切 —— 天气/房间/床位/体温/需求/心情/
         崩溃/农牧/烹饪/工坊/社交, 以及殖民地覆灭判定。
   它是编排, 不是领域: 各子系统的规则住在 Colony/Res/Weather/Nav,
   这里只负责按正确顺序把它们串起来, 并把结果落进 state。
   对视图零依赖 —— 要说话就 U.emit('notice'), 由 ui 订阅(ADR-40)。
   ============================================================ */
window.APH = window.APH || {};

APH.ColonyTick = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;

  function isRepairCrew(r, s){
    if(!r) return false;
    if(s && s.colony && s.colony.rulesVersion===1){
      if(r.downed || r.isSleeping || r.medLying) return false;
      if(r.job && r.job!=='blueprint') return false;
      var wp=s.meta && s.meta.workPrio && s.meta.workPrio[r.id];
      if(wp && wp.sk_build===0) return false;
      return true;
    }
    return !!(r.job==='blueprint' || (r.skills && r.skills.sk_build>=3));
  }
  function founded(m){
    var need = (CFG.colony && CFG.colony.foundedAtResidents != null) ? CFG.colony.foundedAtResidents : 1;
    if(!m) return false;
    if(m.colonyFounded) return true;
    if((m.residents || []).length >= need){ m.colonyFounded = true; return true; }
    return false;
  }
  function checkFall(context){
    var s = context || APH.state, m = s.meta;
    if(!m || s.mode !== 'running' || s.scene !== 'home') return false;
    if(!founded(m)) return false;                 // 还没立过, 谈不上覆灭
    if((m.residents || []).length > 0) return false;    // 还有人活着
    if(m.colonyFallen) return false;                    // 已结算过, 不重复
    m.colonyFallen = true;
    s.mode = 'dead';
    U.emit('gameOver', {});
    APH.Save.saveMeta(m);
    U.emit('death', {reason:'最后一个人也倒下了。新曙光殖民地无人生还。', stats:{
        cry:s.cry, found:s.found, total:s.totalBeacons, carry:s.carry,
        runLoot:s.runLoot, survived:s.clock-(s.landedAt||0), colonyFall:true,
        lost:(m.stats && m.stats.colonistsLost)||0, days:(s.clock||0)/(CFG.DAY_LEN||3600),
      }});
    return true;
  }

  /* rulesVersion=1 才启用“人在合法工位才产出”。老档沿用既有的名册岗位
     语义，避免一次版本升级把所有旧存档的经济链冻死。 */
  function modernWorkRules(s){ return !!(s && s.colony && s.colony.rulesVersion===1); }
  function contextWorldId(s){ return (s && s.id) || ((s && s.scene)==='home' ? 'home' : ((s && s.scene)||'home')); }
  function residentWorldId(r){ return (r && r.worldId) || 'home'; }
  function residentsInContext(s, m){
    var worldId=contextWorldId(s);
    return (m.residents||[]).filter(function(r){ return residentWorldId(r)===worldId; });
  }
  function residentEntity(s, resident){
    var worldId=contextWorldId(s);
    return (s.entities||[]).find(function(e){
      return e && e.type===T.RESIDENT && (e.rid===resident.id || e.id===resident.id) &&
        ((!e.worldId && worldId==='home') || e.worldId===worldId);
    }) || null;
  }
  function workPool(residents){
    var out={};
    (residents||[]).forEach(function(r){
      if(!r || !r.job) return;
      (out[r.job]||(out[r.job]=[])).push(r);
    });
    return out;
  }
  function facilityUid(b){ return (b&&b.uid) || [(b&& (b.bid||b.id))||'building',b&&b.gx!=null?b.gx:b&&b.x,b&&b.gy!=null?b.gy:b&&b.y].join('@'); }
  function terrainFertilityMul(s, b){
    var scene=s&&s.colony&&s.colony.scene, TM=window.APH&&APH.TerrainModel;
    if(!scene || !TM || !TM.fertilityMultiplier || !b || !isFinite(b.x) || !isFinite(b.y)) return 1;
    var mul=TM.fertilityMultiplier(scene,b&&b.x,b&&b.y);
    return isFinite(mul) ? mul : 1;
  }
  function farmGrowthMul(s, b, lawMul, weatherMul, powerMul, seasonMul){
    return lawMul*weatherMul*powerMul*seasonMul*terrainFertilityMul(s,b);
  }
  function takeWorkerAt(s, b, job, pools, bound){
    if(b && b.powered===false){ b.workReason='断电'; return null; }
    var pool=(pools&&pools[job])||[], sawBlocked=false, sawAway=false;
    for(var i=0;i<pool.length;i++){
      var r=pool[i], e=residentEntity(s,r);
      if(bound && bound[r.id]) continue;
      if(residentWorldId(r)!==contextWorldId(s)) continue;
      if(!e || e.dead || r.dead || e.hp<=0 || r.hp<=0 || e.drafted || r.drafted || e.isSleeping || r.isSleeping || e.downed || r.downed) continue;
      var spot=(APH.Construction&&APH.Construction.spot) ? APH.Construction.spot(s,b,e) : null;
      if(!spot){ sawBlocked=true; continue; }
      if(U.dst(e.x,e.y,spot.x,spot.y)>8){ sawAway=true; continue; }
      pool.splice(i,1);
      if(bound) bound[r.id]=facilityUid(b);
      e.workFacilityUid=facilityUid(b);
      b.workReason=null;
      return r;
    }
    b.workReason=sawBlocked?'入口堵塞':(sawAway?'工人未到工位':'缺少在场工人');
    return null;
  }

  function run(context){
    var s=context||APH.state, m=s.meta;
    if(!s || !m || s.scene!=='home') return false;
    var residents=residentsInContext(s,m);
    var modernWork=modernWorkRules(s);
    /* W3 天气效果: 当前天气 id(读 meta.weather, 老档兜底 wx_clear); 极端清单以 exposureGain>0 为准 */
    var wxId=(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(m):'wx_clear';
    var wxFx=(window.APH.Weather&&APH.Weather.weatherEffects)?APH.Weather.weatherEffects(wxId):{};
    var wxExtreme=((wxFx.exposureGain)||0)>0;
    /* T9 无顶房间: 生产跳重算房间(墙/门围合), 供暴露免疫+卧室心情 */
    var T9_rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf(s.colony.buildings,s.colony.scene):[];
    /* 深度生存: 床位分配 (Survival #15) */
    APH.Res.assignBeds(s.colony.buildings, residents, {modern:!!s.colony.rulesVersion});

    /* ADR-25 温度与体温失调结算 (念头上下文也要用, 故先算) */
    var isDay = (window.APH.World && APH.World.daylight) ? APH.World.daylight() >= .5 : true;
    /* T3 季节: 环境气温叠加季节偏移(冬天 -18°C) */
    var season = (window.APH.Weather && APH.Weather.seasonAt)
      ? APH.Weather.seasonAt(s.clock, CFG.DAY_LEN) : null;
    var ambT = (window.APH.Weather && APH.Weather.ambientTemperatureOf)
      ? APH.Weather.ambientTemperatureOf(wxId, isDay, season && season.id) : 22;
    var campfire = (s.colony && s.colony.buildings || []).find(function(b){ return b && (b.id==='bl_campfire'||b.bid==='bl_campfire'); });
    /* ADR-37: 环境量与 ui.js 用同一个构造器, 复用本跳已算好的 rooms/ambT */
    var thEnv = APH.Res.thoughtEnvOf(s);
    thEnv.rooms = T9_rooms; thEnv.ambT = ambT; thEnv.night = !isDay;
    thEnv.wxExtreme = wxExtreme; thEnv.campfire = campfire;

    /* U4 需求结算: 生产跳只掉饱食; 吃饭要走到仓库或粮堆
       ADR-31: 带上念头上下文 —— 心情由 collectThoughts 结算, 检查器同源。 */
    residents.forEach(function(r){
      var rEnt = (s.entities||[]).find(function(e){ return e.type===T.RESIDENT && (e.rid===r.id || e.id===r.id); });
      thEnv.self = r; thEnv.residents = residents; thEnv.bonds = m.bonds;
      var ctx = rEnt ? APH.Res.thoughtCtxAt(rEnt.x, rEnt.y, thEnv) : { raid: !!(s.war&&s.war.raidActive) };
      APH.Res.needsTick(r, false, ctx);
    });
    /* ADR-47: 人型袭击者与殖民者同一套念头，但不走吃饭/上岗。 */
    (s.entities||[]).forEach(function(e){
      if(!e || e.dead || e.isSoldier || !APH.Res.isHumanlike || !APH.Res.isHumanlike(e) || !e.pawn) return;
      var hCtx = e.x != null && APH.Res.thoughtCtxAt ? APH.Res.thoughtCtxAt(e.x, e.y, thEnv) : { raid: true };
      hCtx.raid = true;
      APH.Res.moodFromThoughts(e.pawn, hCtx);
    });
    residents.forEach(function(r){
      var ent = (s.entities||[]).find(function(e){ return e.type===T.RESIDENT && (e.rid===r.id || e.id===r.id); });
      var rTemp = ambT;
      if(ent && window.APH.Nav && APH.Nav.roomAt){
        var cRoom = APH.Nav.roomAt({x:ent.x, y:ent.y}, T9_rooms);
        if(cRoom && cRoom.temp != null) rTemp = cRoom.temp;
      }
      var nearFire = (ent && campfire && U.dst(ent.x, ent.y, campfire.x, campfire.y) <= 50);
      var suitIt = (r.gear && r.gear.suit) ? (CFG.items && CFG.items[r.gear.suit]) : null;
      var tRes = APH.Res.thermalStressTick(r, rTemp, suitIt, 30, nearFire);
      if(tRes.downed && !r.downed){
        r.downed = true;
        r.isSleeping = false;
        U.emit('notice', {text:'❄ ' + r.name + ' 因极端体温失调虚脱击倒了！', color:'#ff6d7a'});
      }
    });

    /* ADR-45: 「指挥官的体温/心情/饱食/精力/娱乐/病情/暴露」整段随化身一起删。
       这些结算殖民者本来就各有一份(下面的 roster 循环), 玩家不再是其中一员。 */

    /* D: 工作优先级调度(人×技能 0~3 表; 替代逐岗 autoAssign) */
    m.workPrio=m.workPrio||{};
    residents.forEach(function(r){
      if(!m.workPrio[r.id]) m.workPrio[r.id]=APH.Res.defaultPrio(r);
    });
    var hasQAssign=(s.colony.buildQueue||[]).length>0;
    var assign=APH.Colony.assignByPriority(residents, s.colony.buildings,
                                           m.workPrio, hasQAssign);
    residents.forEach(function(r){
      if(r.jobLocked) return;
      var nj=(assign[r.id]!==undefined)?assign[r.id]:null;
      if(r.job!==nj){
        r.job=nj;
        if(nj) U.emit('notice', {text:r.name+' 开始在'+APH.Colony.get(nj).name+'工作', color:'#8fd4ff'});
      }
    });
    /* T7: 医疗舱需通电 (powered===false 停诊; 未激活默认通电) */
    var hasClinic=(s.colony.buildings||[]).some(function(b){
      return b.id==='bl_clinic' && APH.Colony.clinicPowered(b);
    });
    var medicSkill=0;
    residents.forEach(function(r){
      if(APH.Res.isBroken && APH.Res.isBroken(r)) return;    // 崩溃的医生缺勤
      if(r.job==='bl_clinic') medicSkill=Math.max(medicSkill, (r.skills&&r.skills.sk_social)||0);
    });
    var tickSeed=((s.seed||7)*1009 + Math.floor(s.clock||0)*17 + (m.residentSeq||0)*13)>>>0;
    var sickRng=U.makeRng(tickSeed);
    var clinicR=(CFG.residents&&CFG.residents.clinicNearR!=null)?CFG.residents.clinicNearR:80;
    residents.forEach(function(r){
      var ent=null;
      s.entities.forEach(function(e){
        if(e.type===T.RESIDENT && (e.rid===r.id||e.id===r.id)) ent=e;
      });
      var inClinic=false;
      if(hasClinic && ent){
        (s.colony.buildings||[]).forEach(function(b){
          if(b.id==='bl_clinic' && U.dst(ent.x,ent.y,b.x,b.y)<clinicR) inClinic=true;
        });
      }
      APH.Res.clinicTick(r, {hasClinic:hasClinic, inClinic:inClinic, medicSkill:medicSkill, rng:sickRng});
      /* W3 天气暴露接线(本票核心): 极端天气室外累积/房间内免疫 (Survival #19 桩复活; T9 房间覆盖)
         sheltered: 房间内=true; 房间外回退 isSheltered(建筑半径); 实体缺位兜底按室内(不误积累) */
      var alienExposure=modernWork&&ent&&APH.Ecology&&APH.Ecology.exposedAt(s,ent);
      if(alienExposure&& !r._alienExposure && !s._background)
        U.emit('notice',{text:r.name+' 接近刺激性异星植物，离开植物丛或穿防护服可降低暴露',color:'#ffc857'});
      r._alienExposure=!!alienExposure;
      APH.Res.exposureTick(r,
        ent ? APH.Res.shelteredFor({x:ent.x, y:ent.y}, s.colony.buildings, T9_rooms) : true,
        wxExtreme||alienExposure, alienExposure?'wx_acid':wxId);
      /* ADR-31: 房间品质(T9)与同室死敌(ADR-22)已并入念头, 见 thoughtCtxAt。 */
      /* #69 医疗舱被拆: 躺舱者起身 (病情回落起身由 needsTick wake gate 负责) */
      if(r.medLying && !hasClinic) r.medLying = false;
      /* #69 击倒判定+送医(接线孤儿 checkDowned/rescueTick; 生产跳=30s) */
      if(!r.downed && APH.Res.checkDowned(r)){
        U.emit('notice', {text:r.name+' 倒下了!', color:'#ff9a9a'});
      }
      if(r.downed){
        var rr=APH.Res.rescueTick([r], s.colony.buildings, 30, hasClinic && APH.Colony.haveStock('med')>0, {inClinic:inClinic});
        if(rr.medUsed){
          var helper=residents.find(function(person){
            if(person===r||person.downed||person.job!=='bl_clinic')return false;
            var pe=residentEntity(s,person);
            return pe&&ent&&U.dst(pe.x,pe.y,ent.x,ent.y)<clinicR;
          });
          if(helper)APH.Res.rememberShared(m,[r.id,helper.id],{
            id:'rescue:'+r.id+':'+s.clock,kind:'rescue',clock:s.clock,
            text:helper.name+' 在病房救助了 '+r.name});
          APH.Colony.takeStock(m.res, s.entities, 'med', 1);
          U.emit('notice', {text:r.name+' 被紧急救治', color:'#7dffab'});
        }
        if(rr.dead.length){
          U.emit('notice', {text:'☠ '+r.name+' 救治不及时, 去世了', color:'#ff9a9a'});
          /* 殖民地优先 T1: 居民之死要被记住 —— 覆灭结算页要说出代价 */
          if(m.stats) m.stats.colonistsLost = (m.stats.colonistsLost||0) + 1;
          var entDead=s.entities.filter(function(en){ return en && (en.rid||en.id)===r.id; })[0];
          Object.keys(r.gear||{}).forEach(function(slot){
            var gear=r.gear[slot];if(!gear)return;
            APH.Combat.spawnDrop(entDead?entDead.x:CFG.HAB.x,entDead?entDead.y:CFG.HAB.y,gear,1,{stock:true,jitter:0});
            r.gear[slot]=null;
          });
          if(APH.Res.makeCorpse){
            s.entities.push(APH.Res.makeCorpse(r, entDead?entDead.x:s.px, entDead?entDead.y:s.py));
          }
          m.residents=m.residents.filter(function(x){ return x.id!==r.id; });
          APH.Save.metaQuiet();                       /* syncResidentEntities 下一帧移除实体 */
        }
      }
    });
    /* canonical 名册只删死者；本世界工作集同步收缩，绝不把远征名册覆盖掉。 */
    residents=residents.filter(function(r){ return (m.residents||[]).indexOf(r)>=0; });
    /* 殖民地优先 T1: 殖民地覆灭判定。
       立过殖民地(名册到过 foundedAtResidents 人)之后又归零 = 本局结束。
       新档开局本来就是 0 人, 所以必须先立过, 否则开局即覆灭。 */
    checkFall(s);

    /* B: 心情崩溃状态机(seeded) + 崩溃行为落地 */
    var breakRng=U.makeRng((tickSeed^0x5EED2B)>>>0);
    var CB=CFG.residents||{};
    residents.forEach(function(r){
      var b=APH.Res.breakTick(r, breakRng);
      if(b.started){
        U.emit('notice', {text:'💢 '+r.name+' 崩溃了: '+APH.Res.BREAK_NAMES[b.started], color:'#ff9a9a'});
        if(b.started==='brawl'){
          var mate=APH.Res.lowestBondMate(r, residents, m.bonds||{});
          if(mate){
            var ill=CB.brawlIll!=null?CB.brawlIll:8;
            APH.Res.hurtResident(mate, ill, 'wound', {mood: CB.brawlMoodHit!=null?CB.brawlMoodHit:15});
            APH.Res.hurtResident(r, ill, 'wound', {mood: false});
            m.bonds=APH.Res.applyBond(m.bonds||{}, r.id, mate.id,
              -(CB.brawlBondHit!=null?CB.brawlBondHit:8));
            U.emit('notice', {text:'⚡ '+r.name+' 和 '+mate.name+' 打了一架', color:'#ff9a9a'});
          }
        }else if(b.started==='tantrum'){
          var hit=CB.tantrumMoodHit!=null?CB.tantrumMoodHit:5;
          var tR=CB.tantrumR!=null?CB.tantrumR:140;
          var meE=null;
          s.entities.forEach(function(e){
            if(e.type===T.RESIDENT && (e.rid===r.id||e.id===r.id)) meE=e;
          });
          residents.forEach(function(o){
            if(o===r || !meE) return;
            var oe=null;
            s.entities.forEach(function(e){
              if(e.type===T.RESIDENT && (e.rid===o.id||e.id===o.id)) oe=e;
            });
            if(oe && U.dst(meE.x,meE.y,oe.x,oe.y)<=tR)
              o.mood=Math.max(0,(o.mood||0)-hit);
          });
        }else if(b.started==='binge'){
          if(APH.Colony.takeStock(m.res, s.entities, 'food', 1).ok){
            r.food=Math.min(100,(r.food||0)+((CB.eatGain!=null)?CB.eatGain:25));
            U.emit('notice', {text:'🍲 '+r.name+' 暴食了一顿', color:'#ffc857'});
          }
        }
      }else if(b.ended){
        U.emit('notice', {text:r.name+' 平静下来了', color:'#8fd4ff'});
      }
    });
    /* 崩溃者本跳不参与任何生产 */
    var workers=residents.filter(function(r){ return !APH.Res.isBroken(r); });
    if(hasClinic && APH.Colony.haveStock('med')>0){
      var sickest=null, bestScore=-1;
      residents.forEach(function(r){
        if((r.illness||0)<=0) return;
        if(r.downed) return;                       /* #69: 击倒者由 rescueTick 用薬, 不双扣 */
        /* F: 疫病患者优先用药(药是唯一根治手段) */
        var plagued=(r.ailments||[]).some(function(a){ return a.type==='plague'; });
        var score=(r.illness||0)+(plagued?1000:0);
        if(score>bestScore){ bestScore=score; sickest=r; }
      });
      if(sickest){
        APH.Res.applyMed(sickest);
        APH.Colony.takeStock(m.res, s.entities, 'med', 1);
        U.emit('notice', {text:(sickest.name||'居民')+' 用药', color:'#7dffab'});
      }
    }

    /* U3/U5 农场/种植槽与岗位产出 (异星奇幻作物) */
    var workerPools=modernWork?workPool(workers):null;
    var workBound=modernWork?{}:null;
    var farmers=workers.filter(function(r){return r.job==='bl_farm'||r.job==='bl_crop_plot';});
    var ranchers=workers.filter(function(r){return r.job==='bl_pasture';});
    var farms=s.colony.buildings.filter(function(b){return b.id==='bl_farm'||b.id==='bl_crop_plot';});
    var nightF=window.APH.World&&APH.World.daylight?APH.World.daylight()<.5:false;
    var lawFarm=APH.Colony.harvestMods(s.spec&&s.spec.laws, s.clock, nightF).farmMul;
    var farmWx=(wxFx.farmMul!=null)?wxFx.farmMul:1;   // W3: 天气农产乘子(雨+30%/酸雨×0.5/雪停滞) 乘入 harvestMods 链
    /* T3 季节生长乘子: 冬天为 0 —— 冬天种不出东西, 只能吃存粮 */
    var seasonGrow = (window.APH.Weather && APH.Weather.seasonAt)
      ? APH.Weather.seasonAt(s.clock, CFG.DAY_LEN).growMul : 1;
    farms.forEach(function(b){
      if(!b.plot) b.plot={stage:0,t:0};
      if(!b.crop){
        if(b.id==='bl_crop_plot') return;
        b.crop='crop_glow_shroom';
      }
      if(APH.Colony.ALIEN_CROPS[b.crop] && !APH.Colony.canPlantCrop(b.crop, m.analyzedFlora)) return;
      var bestFarmer=modernWork ? takeWorkerAt(s,b,b.id,workerPools,workBound) : farmers.reduce(function(acc,r){
        return (acc===null||(r.skills.sk_farm>(acc.skills.sk_farm||0)))?r:acc;
      },null);
      if(modernWork && !bestFarmer) return;
      var farmMul=((s.meta.tech&&s.meta.tech.te_radar)||0)*0.15;
      var farmEff=bestFarmer?APH.Res.efficiency(bestFarmer):1;
      var farmSk=bestFarmer?(bestFarmer.skills.sk_farm||0):0;
      /* v1 家园由 TerrainModel 提供土壤；generation 0 回传 1，旧地图节奏不动。 */
      var soilMul=terrainFertilityMul(s,b);
      if(modernWork) b.soilFertility=soilMul;
      /* T7: 无电农场减产 (powered===false 时×0.5; 未激活默认通电) */
      var powMul=APH.Colony.farmPowerMul(b.powered);
      b.plot=APH.Colony.cropPlotTick(b.plot, farmSk, farmEff,
        farmGrowthMul(s,b,lawFarm,farmWx,powMul,seasonGrow), b.crop);
      if((b.plot.stage||0) >= 3){
        var h=APH.Colony.harvestAlienCrop(b.crop, farmSk);
        if(h.dropItemId && h.dropCount>0){
          if(APH.Colony.ALIEN_CROPS[b.crop]){
            m.alienHarvests=m.alienHarvests||{};
            m.alienHarvests[b.crop]=(m.alienHarvests[b.crop]||0)+h.dropCount;
          }
          APH.Combat.spawnDrop(b.x+14, b.y+18, h.dropItemId, h.dropCount, {stock:true});
          if(h.extraItemId && h.extraCount>0){
            APH.Combat.spawnDrop(b.x-10, b.y+18, h.extraItemId, h.extraCount, {stock:true});
          }
          var itName=(CFG.items[h.dropItemId]&&CFG.items[h.dropItemId].name)?CFG.items[h.dropItemId].name:h.dropItemId;
          U.emit('notice', {text:'🌾 收获 '+itName+' +'+h.dropCount, color:'#c8e89a'});
        }
        b.plot={stage:0,t:0};
      }
    });
    (s.colony.buildings||[]).forEach(function(b){
      if(!b || b.id==='bl_landing_pad') return;
      if(APH.Colony.ensureBuildingHp) APH.Colony.ensureBuildingHp(b);
      if(APH.Colony.decayBuilding) APH.Colony.decayBuilding(b, 0.04);
    });
    var buildersNear=residents.filter(function(r){ return isRepairCrew(r, s); });
    if(buildersNear.length){
      (s.colony.buildings||[]).forEach(function(b){
        if(b && b.hp!=null && b.maxHp && b.hp<b.maxHp) APH.Colony.repairBuilding(b, 1.2);
      });
    }
    if(APH.Colony.tickFires){
      s.colony.fires = APH.Colony.tickFires(s.colony.fires||[], Math.random, s.colony.buildings);
      (s.colony.buildings||[]).forEach(function(b){
        if(b.id==='bl_campfire' && Math.random()<0.04){
          s.colony.fires = APH.Colony.addFire(s.colony.fires||[], b.x+CFG.GRID, b.y);
        }
      });
    }
    if(s.colony.zones && APH.Colony.tickGrowZones){
      var growFarmer=farmers.reduce(function(acc,r){
        return (acc===null||(r.skills.sk_farm>(acc.skills.sk_farm||0)))?r:acc;
      },null);
      if(growFarmer){
        var gzSeason=(window.APH.Weather && APH.Weather.seasonAt)
          ? APH.Weather.seasonAt(s.clock, CFG.DAY_LEN).growMul : 1;
        var gz=APH.Colony.tickGrowZones(s.colony.zones, growFarmer.skills.sk_farm||0, APH.Res.efficiency(growFarmer), gzSeason);
        (gz.harvested||[]).forEach(function(h){
          if(h.drop && h.drop.dropItemId){
            APH.Combat.spawnDrop(h.x, h.y, h.drop.dropItemId, h.drop.dropCount||1, {stock:true});
            U.emit('notice', {text:'🌾 种植区收获', color:'#c8e89a'});
          }
        });
      }
    }
    /* U6 畜牧: 羊群自然增长, 产肉/皮(纯函数 ranchTick, 每牧场一调) */
    var pastures=s.colony.buildings.filter(function(b){return b.id==='bl_pasture';});
    var ranchRng=U.makeRng(((s.seed||7)*2017 + Math.floor(s.clock||0)*31 + pastures.length)>>>0);
    pastures.forEach(function(b){
      var bestRancher=modernWork ? takeWorkerAt(s,b,'bl_pasture',workerPools,workBound) : ranchers.reduce(function(acc,r){
        return (acc===null||(r.skills.sk_ranch>(acc.skills.sk_ranch||0)))?r:acc;
      },null);
      if(modernWork && !bestRancher) return;
      var rSk=bestRancher?(bestRancher.skills.sk_ranch||0):0;
      var ranchEff=bestRancher?APH.Res.efficiency(bestRancher):1;
      if(b.herd===undefined) b.herd=1;           // 新牧场自带1只
      var out=APH.Colony.ranchTick(b, rSk, m.res, ranchRng, ranchEff);
      if(out.foodGain>0)
        APH.Combat.spawnDrop(b.x+12, b.y+16, 'it_food', out.foodGain, {stock:true});
      if(out.leatherGain>0)
        APH.Combat.spawnDrop(b.x-10, b.y+18, 'it_leather', out.leatherGain, {stock:true});
      if(out.leatherGain>0)
        U.emit('notice', {text:'🐑 畜牧产出堆在地上 +'+out.foodGain+'肉 +'+out.leatherGain+'皮', color:'#c8e89a'});
      if(APH.Colony.syncPastureAnimals) APH.Colony.syncPastureAnimals(b, s.entities);
      else if(out.foodGain>0)
        U.emit('notice', {text:'🐑 畜牧产出堆在地上 +'+out.foodGain+' 食物', color:'#c8e89a'});
    });

    if(modernWork&&APH.ProductionJobs)APH.ProductionJobs.prepare(s);
    var labs=s.colony.buildings.filter(function(b){return b.id==='bl_lab';});
    var scholars=workers.filter(function(r){return r.job==='bl_lab';});
    labs.forEach(function(b){
      var w=modernWork ? takeWorkerAt(s,b,'bl_lab',workerPools,workBound) : scholars.shift();
      if(!w) return;
      var target=b.analysisTarget || 'specimen_flora_glow';
      if(!modernWork&&APH.Colony.ensureStock) APH.Colony.ensureStock(m.res, s.entities, target, 1);
      var loreSk=(w.skills&&w.skills.sk_lore)||0;
      var loreEff=APH.Res.efficiency(w);
      var labOut=modernWork&&APH.ProductionJobs?APH.ProductionJobs.tick(s,b,loreSk,loreEff,1):APH.Colony.labAnalysisTick(b, loreSk, loreEff, m.res, 1);
      s.entities.forEach(function(e){
        if(e.type===T.BUILDING && e.bid==='bl_lab' &&
           Math.abs((e.x||0)-(b.x||0))<2 && Math.abs((e.y||0)-(b.y||0))<2){
          e.analysisTarget=b.analysisTarget;
          e.analysisProgress=b.analysisProgress;
        }
      });
      if(labOut && labOut.done){
        var yld=APH.Colony.applySpecimenAnalysis(m, m.res, labOut.def, labOut.specimenId);
        var seedIds=Object.keys(yld.seeds||{});
        for(var si=0;si<seedIds.length;si++){
          var sid=seedIds[si], sn=yld.seeds[sid]||0;
          if(sn>0) APH.Combat.spawnDrop(b.x+16, b.y+14, sid, sn, {stock:true});
        }
        var bits=[];
        if(yld.unlockCrop && APH.Colony.ALIEN_CROPS[yld.unlockCrop])
          bits.push('解锁 '+APH.Colony.ALIEN_CROPS[yld.unlockCrop].name);
        if(yld.unlockTech && APH.Colony.TECHS[yld.unlockTech]){
          bits.push(APH.Colony.TECHS[yld.unlockTech].name);
          APH.Colony.applyTech(m, yld.unlockTech);
        }
        if(yld.eureka) bits.push('尤里卡 +'+yld.eureka);
        U.emit('notice', {text:'🔬 化验突破'+(bits.length?': '+bits.join(' / '):''), color:'#59d9ff'});
      }
    });

    if(modernWork&&APH.ProductionJobs)APH.ProductionJobs.prepare(s);
    var shops=s.colony.buildings.filter(function(b){return b.id==='bl_workshop';});
    var crafters=workers.filter(function(r){return r.job==='bl_workshop';});
    shops.forEach(function(b){
      var w=modernWork ? takeWorkerAt(s,b,'bl_workshop',workerPools,workBound) : crafters.shift();
      if(!w) return;
      var cEff=APH.Res.efficiency(w);
      var cSk=(w.skills&&w.skills.sk_craft)||0;
      if(modernWork&&APH.ProductionJobs){
        var produced=APH.ProductionJobs.tick(s,b,cSk,cEff,1);
        if(produced.done&&produced.producedItemId){APH.Combat.spawnDrop(b.x+16,b.y+14,produced.producedItemId,produced.count||1,{stock:true});U.emit('notice',{text:'工坊已完成加工，成品等待搬运',color:'#7dffab'});}
      }else if(b.recipe && APH.Colony.CRAFT_RECIPES[b.recipe]){
        var out=APH.Colony.workshopCraftTick(b, cSk, cEff, m.res, m.tech, 1);
        if(out.done && out.producedItemId){
          APH.Combat.spawnDrop(b.x+16, b.y+14, out.producedItemId, out.count||1, {stock:true});
          var pName=(CFG.items[out.producedItemId]&&CFG.items[out.producedItemId].name)||out.producedItemId;
          U.emit('notice', {text:'🛠 工坊制造完成: '+pName, color:'#7dffab'});
        }
      }else{
        var cost=(CFG.workshop&&CFG.workshop.mineralCost!=null)?CFG.workshop.mineralCost:2;
        if(!APH.Colony.ensureStock(m.res, s.entities, 'mineral', cost)) return;
        var outLegacy=APH.Colony.workshopTick(w, m.res, b.lv||1);
        if(outLegacy.med>0){
          APH.Combat.spawnDrop(b.x+16, b.y+14, 'it_med', outLegacy.med, {stock:true});
          U.emit('notice', {text:'💊 工坊药品堆在地上 +'+outLegacy.med, color:'#e0b089'});
        }
      }
    });

    /* 外星烹饪与餐饮生产流水线 (Cooking #49) */
    var kitchens=s.colony.buildings.filter(function(b){ return b.id==='bl_kitchen'||b.id==='bl_campfire'; });
    var chefs=workers.filter(function(r){ return r.job==='bl_kitchen'; });
    kitchens.forEach(function(b){
      var w = modernWork ? takeWorkerAt(s,b,'bl_kitchen',workerPools,workBound) : ((b.id==='bl_kitchen') ? chefs.shift() : null);
      if(modernWork && !w) return;
      var cSk = w ? ((w.skills&&w.skills.sk_farm)||0) : 0;
      var cEff = w ? APH.Res.efficiency(w) : 1;
      var out = modernWork&&APH.ProductionJobs?APH.ProductionJobs.tick(s,b,cSk,cEff,1):APH.Colony.cookingTick(b, cSk, cEff, m.res, m.tech, 1);
      if(out && out.done && out.producedItemId){
        APH.Combat.spawnDrop(b.x+14, b.y+16, out.producedItemId, out.count||1, {stock:true});
        var pName = (CFG.items[out.producedItemId]&&CFG.items[out.producedItemId].name)||out.producedItemId;
        U.emit('notice', {text:'🍲 烹饪完成: '+pName, color:'#ffca28'});
      }
    });

    /* 篝火身心光环与围炉社交结算 (Cooking #49) */
    var campfires=s.colony.buildings.filter(function(b){ return b.id==='bl_campfire'; });
    if(campfires.length > 0 && APH.Res.campfireAuraTick){
      var fireRes = APH.Res.campfireAuraTick(residents, campfires, { meta: m });
      if(fireRes && fireRes.gatheredCount > 0){
        U.emit('notice', {text:'🔥 居民们在篝火旁围炉夜话 (+羁绊 +心情)', color:'#ffc857'});
      }
    }
    s.entities.forEach(function(e){
      if(e.type===T.DROPPED && (e.dead || (e.n||0)<=0)) APH.Ent.destroy(e);
    });
    s.entities=APH.Ent.sweepDead(s.entities);

    /* V1 全局专长加成 */
    var gb=APH.Res.globalBonuses(residents);
    if(gb.lorePerTick>0){
      m.research+=Math.round(gb.lorePerTick);
    }
    if(gb.moodBoost>0){
      residents.forEach(function(r){ r.mood=Math.min(100,r.mood+gb.moodBoost); });
    }
    /* V3 随机社交事件(有≥2居民时; seeded, ADR-5) */
    var socialRng=U.makeRng((tickSeed^0xA5A5A5A5)>>>0);
    if(residents.length>=2 && socialRng()<0.4){
      var ia=Math.floor(socialRng()*residents.length);
      var ib=(ia+1+Math.floor(socialRng()*(residents.length-1)))%residents.length;
      var ra=residents[ia], rb=residents[ib];
      var positive = socialRng()<0.6;
      if(!positive && (ra.trait==='暴脾气'||rb.trait==='暴脾气')) positive=false;
      else if(ra.mood<35||rb.mood<35) positive=socialRng()<0.3;   // 低心情易冲突
      if(positive){
        m.bonds=APH.Res.applyBond(m.bonds||{},ra.id,rb.id,+4);
        ra.mood=Math.min(100,ra.mood+2); rb.mood=Math.min(100,rb.mood+2);
        U.emit('notice', {text:'💬 '+ra.name+' 和 '+rb.name+' 在食堂聊得很开心', color:'#8fd4ff'});
      }else{
        m.bonds=APH.Res.applyBond(m.bonds||{},ra.id,rb.id,-5);
        ra.mood=Math.max(0,ra.mood-2); rb.mood=Math.max(0,rb.mood-2);
        U.emit('notice', {text:'⚡ '+ra.name+' 和 '+rb.name+' 吵了一架', color:'#ff9a9a'});
      }
    }

    /* U7 社交 */
    var pairs=[];
    for(var i=0;i<residents.length;i++)
      for(var j=i+1;j<residents.length;j++){
        var a=residents[i], b=residents[j];
        pairs.push({a:a,b:b,sameJob:!!(a.job&&a.job===b.job)});
      }
    if(!m.bonds) m.bonds={};
    APH.Res.socialTick(pairs).forEach(function(d){
      m.bonds=APH.Res.applyBond(m.bonds,d.a,d.b,d.delta);
    });
    APH.Save.metaQuiet();
    APH.Colony.persist();
    /* ADR-42: 生产跳结束。过客拜访(依赖开场闸门)与科技树重绘都不属于
       殖民地模拟本身, 由订阅者去做 —— 这是本函数搬出 main 的最后两根线。
       U.emit 同步派发, 顺序与原先直调完全一致。 */
    U.emit('productionTick', {});
  }

  return { run:run, checkFall:checkFall, founded:founded, isRepairCrew:isRepairCrew,
    takeWorkerAt:takeWorkerAt, modernWorkRules:modernWorkRules, facilityUid:facilityUid,
    terrainFertilityMul:terrainFertilityMul, farmGrowthMul:farmGrowthMul };
})();
