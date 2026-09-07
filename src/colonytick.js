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

  function founded(m){
    var need = (CFG.colony && CFG.colony.foundedAtResidents != null) ? CFG.colony.foundedAtResidents : 1;
    if(!m) return false;
    if(m.colonyFounded) return true;
    if((m.residents || []).length >= need){ m.colonyFounded = true; return true; }
    return false;
  }
  /* ---------- ADR-44: 指挥官倒下 ----------
     全项目原先有三处「指挥官死 = 本局结束」: 远征战死、远征缺氧、家园失血过多。
     可「殖民地优先」说的是「还有人活着, 殖民地就还在」—— 这三处直接和设计支柱打架。
     现在它们统一走这里: 有人接班就接班, 名册空了才是真的结束。
     本局结束的唯一出口, 剩下 checkFall(殖民地覆灭)。

     reason: 死因文本 · at: 倒下的位置(家园留尸体; 远征在天外, 不留)
     返回 true = 已继任(调用方继续跑), false = 本局结束(调用方已被本函数收尾)。 */
  function commanderFell(reason, at){
    var s = APH.state, m = s.meta;
    if(!m || s.mode !== 'running') return false;
    var r = APH.Res.succeedCommander(m);
    if(!r.ok){
      /* 没人接班 —— 这才是真的结束 */
      s.mode = 'dead';
      U.emit('gameOver', {});
      m.stats = m.stats || {}; m.stats.deaths = (m.stats.deaths || 0) + 1;
      APH.Save.saveMeta(m);
      U.emit('death', { reason: reason, stats:{
        cry:s.cry, found:s.found, total:s.totalBeacons, carry:s.carry,
        runLoot:s.runLoot, survived:s.clock-(s.landedAt||0),
        lastCommander:true, days:(s.clock||0)/(CFG.DAY_LEN||3600),
      }});
      return false;
    }
    /* 家园: 前任留下尸体, 让殖民地看得见代价(远征在天外, 尸体带不回来) */
    if(at && s.scene === 'home' && APH.Res.makeCorpse){
      s.entities.push(APH.Res.makeCorpse(
        { id:'cmd_'+(r.successor.succeeded||1), name:r.fallen.name }, at.x, at.y));
    }
    var wasExpedition = (s.scene === 'expedition');
    if(wasExpedition){
      /* 继任者在家, 前任和他背上的东西都留在了荒原 —— 远征收益随人一起没了。
         这是「指挥官不再是本局」之后, 远征风险仅剩的落点。 */
      s.carry = {};
      s.runLoot = 0;
    }
    /* 继任者是已经在场的人 —— 把指挥官的身体挪到他站的地方 */
    var heirEnt = null;
    (s.entities||[]).forEach(function(e){
      if(e && !e.dead && e.type===T.RESIDENT && (e.rid||e.id)===r.heir.id) heirEnt = e;
    });
    if(heirEnt){ s.px = heirEnt.x; s.py = heirEnt.y; heirEnt.dead = true; }
    s.hp = CFG.player.hpMax;
    s.o2 = CFG.player.o2Max;
    s.downed = false;
    s.playerDrafted = false;
    s.selectedRid = null;
    s.target = null;
    APH.Save.saveMeta(m);
    /* 场景切换归 main(enterHome 要重建世界), 这里只报信。 */
    if(wasExpedition) U.emit('forceReturnHome', { reason:reason });
    U.emit('commanderSucceeded', { fallen:r.fallen, successor:r.successor, reason:reason });
    U.emit('notice', {text:'⭐ ' + r.fallen.name + ' 倒下了 · ' + r.successor.name + ' 接过了指挥权',
                      color:'#ffc857'});
    return true;
  }

  function checkFall(){
    var s = APH.state, m = s.meta;
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

  function run(){
    var s=APH.state, m=s.meta;
    /* W3 天气效果: 当前天气 id(读 meta.weather, 老档兜底 wx_clear); 极端清单以 exposureGain>0 为准 */
    var wxId=(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(m):'wx_clear';
    var wxFx=(window.APH.Weather&&APH.Weather.weatherEffects)?APH.Weather.weatherEffects(wxId):{};
    var wxExtreme=((wxFx.exposureGain)||0)>0;
    /* T9 无顶房间: 生产跳重算房间(墙/门围合), 供暴露免疫+卧室心情 */
    var T9_rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf(s.colony.buildings):[];
    /* 深度生存: 床位分配 (Survival #15) */
    APH.Res.assignBeds(s.colony.buildings, m.residents);

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
    m.residents.forEach(function(r){
      var rEnt = (s.entities||[]).find(function(e){ return e.type===T.RESIDENT && (e.rid===r.id || e.id===r.id); });
      thEnv.self = r; thEnv.residents = m.residents; thEnv.bonds = m.bonds;
      var ctx = rEnt ? APH.Res.thoughtCtxAt(rEnt.x, rEnt.y, thEnv) : { raid: !!(s.war&&s.war.raidActive) };
      APH.Res.needsTick(r, false, ctx);
    });
    m.residents.forEach(function(r){
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

    if(m.playerNeeds && s.scene === 'home'){
      var pRoom = (window.APH.Nav && APH.Nav.roomAt) ? APH.Nav.roomAt({x:s.px, y:s.py}, T9_rooms) : null;
      var pTemp = (pRoom && pRoom.temp != null) ? pRoom.temp : ambT;
      var pNearFire = (campfire && U.dst(s.px, s.py, campfire.x, campfire.y) <= 50);
      var pSuit = (s.carry && s.carry.suit) ? (CFG.items && CFG.items[s.carry.suit]) : null;
      APH.Res.thermalStressTick(m.playerNeeds, pTemp, pSuit, 30, pNearFire);
    }
    if(APH.Res.ensurePlayerNeeds) APH.Res.ensurePlayerNeeds(m);
    /* 殖民地优先 T1: 指挥官的心情与居民走同一条路(ADR-31 念头驱动)。
       在此之前 playerNeeds 根本没有 mood —— 检查器给指挥官看的念头面板
       是纯展示, 现在它同样在推动一个真数字。 */
    if(m.playerNeeds && s.scene==='home' && APH.Res.moodFromThoughts){
      thEnv.self = null; thEnv.residents = null; thEnv.bonds = null;
      APH.Res.moodFromThoughts(m.playerNeeds, APH.Res.thoughtCtxAt(s.px, s.py, thEnv));
    }
    if(APH.Res.homeFoodTick && m.playerNeeds){
      m.playerNeeds.food = APH.Res.homeFoodTick(m.playerNeeds.food, s.scene);
    }
    if(APH.Res.playerRestTick && m.playerNeeds){
      /* #66 床边睡眠: 综合精力结算(睡眠恢复/清醒衰减, 委托 homeRestTick) */
      /* #70 医疗舱躺下: hasBed 含医疗舱 — 舱内躺卧按床速恢复(≠#67 地铺 18) */
      APH.Res.playerRestTick(m.playerNeeds, s.scene, !!s.nearBed || !!s.nearClinic);
    }
    if(m.playerNeeds && s.scene==='home'){
      var recDrain=(CFG.residents&&CFG.residents.recreationDrain!=null)?CFG.residents.recreationDrain:5;
      var rec0=m.playerNeeds.recreation!=null?m.playerNeeds.recreation:80;
      m.playerNeeds.recreation=Math.max(0, rec0-recDrain);
    }
    if(APH.Res.homeIllnessTick && m.playerNeeds){
      m.playerNeeds.illness = APH.Res.homeIllnessTick(m.playerNeeds.illness, s.scene);
    }
    /* P1b 玩家暴露(#93): 极端天气室外累积(装备减免)/室内+房间消退; 远征不结算 */
    if(APH.Res.playerExposureTick && m.playerNeeds && s.scene==='home'){
      APH.Res.playerExposureTick(m.playerNeeds,
        APH.Res.shelteredFor({x:s.px, y:s.py}, s.colony.buildings, T9_rooms),
        wxExtreme, wxId);
    }
    /* D: 工作优先级调度(人×技能 0~3 表; 替代逐岗 autoAssign) */
    m.workPrio=m.workPrio||{};
    m.residents.forEach(function(r){
      if(!m.workPrio[r.id]) m.workPrio[r.id]=APH.Res.defaultPrio(r);
    });
    var hasQAssign=(s.colony.buildQueue||[]).length>0;
    var assign=APH.Colony.assignByPriority(m.residents, s.colony.buildings,
                                           m.workPrio, hasQAssign);
    m.residents.forEach(function(r){
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
    m.residents.forEach(function(r){
      if(APH.Res.isBroken && APH.Res.isBroken(r)) return;    // 崩溃的医生缺勤
      if(r.job==='bl_clinic') medicSkill=Math.max(medicSkill, (r.skills&&r.skills.sk_social)||0);
    });
    var tickSeed=((s.seed||7)*1009 + Math.floor(s.clock||0)*17 + (m.residentSeq||0)*13)>>>0;
    var sickRng=U.makeRng(tickSeed);
    var clinicR=(CFG.residents&&CFG.residents.clinicNearR!=null)?CFG.residents.clinicNearR:80;
    m.residents.forEach(function(r){
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
      APH.Res.exposureTick(r,
        ent ? APH.Res.shelteredFor({x:ent.x, y:ent.y}, s.colony.buildings, T9_rooms) : true,
        wxExtreme, wxId);
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
          APH.Colony.takeStock(m.res, s.entities, 'med', 1);
          U.emit('notice', {text:r.name+' 被紧急救治', color:'#7dffab'});
        }
        if(rr.dead.length){
          U.emit('notice', {text:'☠ '+r.name+' 救治不及时, 去世了', color:'#ff9a9a'});
          /* 殖民地优先 T1: 居民之死要被记住 —— 覆灭结算页要说出代价 */
          if(m.stats) m.stats.colonistsLost = (m.stats.colonistsLost||0) + 1;
          var entDead=s.entities.filter(function(en){ return en && (en.rid||en.id)===r.id; })[0];
          if(APH.Res.makeCorpse){
            s.entities.push(APH.Res.makeCorpse(r, entDead?entDead.x:s.px, entDead?entDead.y:s.py));
          }
          m.residents=m.residents.filter(function(x){ return x.id!==r.id; });
          APH.Save.metaQuiet();                       /* syncResidentEntities 下一帧移除实体 */
        }
      }
    });
    /* 殖民地优先 T1: 殖民地覆灭判定。
       立过殖民地(名册到过 foundedAtResidents 人)之后又归零 = 本局结束。
       新档开局本来就是 0 人, 所以必须先立过, 否则开局即覆灭。 */
    checkFall();

    /* B: 心情崩溃状态机(seeded) + 崩溃行为落地 */
    var breakRng=U.makeRng((tickSeed^0x5EED2B)>>>0);
    var CB=CFG.residents||{};
    m.residents.forEach(function(r){
      var b=APH.Res.breakTick(r, breakRng);
      if(b.started){
        U.emit('notice', {text:'💢 '+r.name+' 崩溃了: '+APH.Res.BREAK_NAMES[b.started], color:'#ff9a9a'});
        if(b.started==='brawl'){
          var mate=APH.Res.lowestBondMate(r, m.residents, m.bonds||{});
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
          m.residents.forEach(function(o){
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
    var workers=m.residents.filter(function(r){ return !APH.Res.isBroken(r); });
    if(hasClinic && APH.Colony.haveStock('med')>0){
      var sickest=null, bestScore=-1;
      m.residents.forEach(function(r){
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
      var bestFarmer=farmers.reduce(function(acc,r){
        return (acc===null||(r.skills.sk_farm>(acc.skills.sk_farm||0)))?r:acc;
      },null);
      var farmMul=((s.meta.tech&&s.meta.tech.te_radar)||0)*0.15;
      var farmEff=bestFarmer?APH.Res.efficiency(bestFarmer):1;
      var farmSk=bestFarmer?(bestFarmer.skills.sk_farm||0):0;
      /* T7: 无电农场减产 (powered===false 时×0.5; 未激活默认通电) */
      var powMul=APH.Colony.farmPowerMul(b.powered);
      b.plot=APH.Colony.cropPlotTick(b.plot, farmSk, farmEff, lawFarm*farmWx*powMul*seasonGrow, b.crop);
      if((b.plot.stage||0) >= 3){
        var h=APH.Colony.harvestAlienCrop(b.crop, farmSk);
        if(h.dropItemId && h.dropCount>0){
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
    var buildersNear=(m.residents||[]).filter(function(r){ return r && (r.job==='blueprint' || (r.skills && r.skills.sk_build>=3)); });
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
    var bestRancher=ranchers.reduce(function(acc,r){
      return (acc===null||(r.skills.sk_ranch>(acc.skills.sk_ranch||0)))?r:acc;
    },null);
    var rSk=bestRancher?(bestRancher.skills.sk_ranch||0):0;
    var ranchEff=bestRancher?APH.Res.efficiency(bestRancher):1;
    var ranchRng=U.makeRng(((s.seed||7)*2017 + Math.floor(s.clock||0)*31 + pastures.length)>>>0);
    pastures.forEach(function(b){
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

    var labs=s.colony.buildings.filter(function(b){return b.id==='bl_lab';});
    var scholars=workers.filter(function(r){return r.job==='bl_lab';});
    labs.forEach(function(b){
      var w=scholars.shift();
      if(!w) return;
      var target=b.analysisTarget || 'specimen_flora_glow';
      if(APH.Colony.ensureStock) APH.Colony.ensureStock(m.res, s.entities, target, 1);
      var loreSk=(w.skills&&w.skills.sk_lore)||0;
      var loreEff=APH.Res.efficiency(w);
      var labOut=APH.Colony.labAnalysisTick(b, loreSk, loreEff, m.res, 1);
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

    var shops=s.colony.buildings.filter(function(b){return b.id==='bl_workshop';});
    var crafters=workers.filter(function(r){return r.job==='bl_workshop';});
    shops.forEach(function(b){
      var w=crafters.shift();
      if(!w) return;
      var cEff=APH.Res.efficiency(w);
      var cSk=(w.skills&&w.skills.sk_craft)||0;
      if(b.recipe && APH.Colony.CRAFT_RECIPES[b.recipe]){
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
      var w = (b.id==='bl_kitchen') ? chefs.shift() : null;
      var cSk = w ? ((w.skills&&w.skills.sk_farm)||0) : 0;
      var cEff = w ? APH.Res.efficiency(w) : 1;
      var out = APH.Colony.cookingTick(b, cSk, cEff, m.res, m.tech, 1);
      if(out && out.done && out.producedItemId){
        APH.Combat.spawnDrop(b.x+14, b.y+16, out.producedItemId, out.count||1, {stock:true});
        var pName = (CFG.items[out.producedItemId]&&CFG.items[out.producedItemId].name)||out.producedItemId;
        U.emit('notice', {text:'🍲 烹饪完成: '+pName, color:'#ffca28'});
      }
    });

    /* 篝火身心光环与围炉社交结算 (Cooking #49) */
    var campfires=s.colony.buildings.filter(function(b){ return b.id==='bl_campfire'; });
    if(campfires.length > 0 && APH.Res.campfireAuraTick){
      var fireRes = APH.Res.campfireAuraTick(m.residents, campfires, { meta: m });
      if(fireRes && fireRes.gatheredCount > 0){
        U.emit('notice', {text:'🔥 居民们在篝火旁围炉夜话 (+羁绊 +心情)', color:'#ffc857'});
      }
    }
    s.entities.forEach(function(e){
      if(e.type===T.DROPPED && (e.dead || (e.n||0)<=0)) APH.Ent.destroy(e);
    });
    s.entities=APH.Ent.sweepDead(s.entities);

    /* V1 全局专长加成 */
    var gb=APH.Res.globalBonuses(m.residents);
    if(gb.lorePerTick>0){
      m.research+=Math.round(gb.lorePerTick);
    }
    if(gb.moodBoost>0){
      m.residents.forEach(function(r){ r.mood=Math.min(100,r.mood+gb.moodBoost); });
    }
    /* V3 随机社交事件(有≥2居民时; seeded, ADR-5) */
    var socialRng=U.makeRng((tickSeed^0xA5A5A5A5)>>>0);
    if(m.residents.length>=2 && socialRng()<0.4){
      var ia=Math.floor(socialRng()*m.residents.length);
      var ib=(ia+1+Math.floor(socialRng()*(m.residents.length-1)))%m.residents.length;
      var ra=m.residents[ia], rb=m.residents[ib];
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
    for(var i=0;i<m.residents.length;i++)
      for(var j=i+1;j<m.residents.length;j++){
        var a=m.residents[i], b=m.residents[j];
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

  /* ADR-44: combat 早于本模块加载, 够不着 commanderFell, 所以它发事件、这里接。
     订阅点放在本模块而不是 main —— 不装 main 的测试入口也得能走完死亡链路,
     否则那里的玩家会「死不掉」, 而用例还是绿的。 */
  U.on('commanderFell', function(p){
    commanderFell((p && p.reason) || '指挥官倒下了。', p && p.at);
  });

  return { run:run, checkFall:checkFall, founded:founded, commanderFell:commanderFell };
})();
