/* ============================================================
   Aphelion · hints.js — 家园提示层 (ADR-41)
   挂载: window.APH.Hints
   职责: 只回答一个问题 —— 「此刻屏幕底部该显示哪一句话」。
   纯读取: 不改 state, 不碰 DOM, 只返回字符串(或 null = 没意见)。
   优先级表在 forHome(), 改优先级改那里, 不要靠调用顺序。
   ============================================================ */
window.APH = window.APH || {};

APH.Hints = (function(){
  'use strict';
  var CFG = APH.CFG;

  function hintNearbyThing(s){
    if(s.nearTransmitter){
      var txRec = APH.Colony.recordOf(s.nearTransmitter);
      var txPowered = !(txRec && txRec.powered === false);
      return txPowered
        ? '[E] 呼叫救援 · 离开这颗星球'
        : '深空发射器 · 未通电（需接入导线并有足够发电）';
    }
    if(s.nearVisitor){
      var vp=s.nearVisitor.profile||s.nearVisitor;
      var skn=APH.Res.SKILL_NAMES[vp.mainSkill]||'';
      var ctxH=APH.Res.recruitCtx(s.nearVisitor);
      var intent=APH.Res.joinIntentOf(vp);
      var tag=intent==='refugee'?'难民':(intent==='trader'?'游商':'过路客');
      var mealCost=(CFG.recruit&&CFG.recruit.mealCost)||2;
      var imp=Math.round(s.nearVisitor.impression!=null?s.nearVisitor.impression:50);
      var mealBit='';
      if(!s.nearVisitor.fed){
        mealBit=APH.Colony.haveStock('food')>=mealCost
          ? '  [F] 请客(-'+mealCost+'粮)'
          : '  [F] 没粮请客';
      }
      if(s.nearVisitor.trade) mealBit+='  [E] 交易';
      if((s.nearVisitor.askCd||0)>0) return vp.name+' 还想再看看… · 印象'+imp+mealBit;
      var ch=APH.Res.joinChance(vp, ctxH);
      var extra=ch.ok
        ? (intent==='refugee'?' · 会留下':' · '+APH.Res.chanceLabel(ch.chance))
        : ' — '+ch.why;
      return (intent==='trader'?'[E] ':'[E] 招募 ')+
        (vp.name||'过客')+' · '+tag+
        (skn?' · '+skn+(vp.skills&&vp.skills[vp.mainSkill]||''):'')+
        (vp.trait?' · '+vp.trait:'')+ extra+' · 印象'+imp+mealBit;
    }
    if(s.nearResident){
      var rProfile = APH.Res.residentOf(s.nearResident);
      if(rProfile && APH.Res && APH.Res.isBroken && APH.Res.isBroken(rProfile)){
        return '[E] 安抚情绪 (' + (rProfile.name || '居民') + ' 正在 ' + (APH.Res.BREAK_NAMES[rProfile.breakType] || rProfile.breakType) + ')';
      }
      if(rProfile){
        var rTier = (APH.Res && APH.Res.relationshipTierOf) ? APH.Res.relationshipTierOf((s.meta && s.meta.bonds && s.meta.bonds['player|' + rProfile.id]) || 50) : { name:'平淡', icon:'😐' };
        return '[E] 打招呼  [F] 请客 · ' + (rProfile.name || '居民') + ' (' + rTier.icon + ' ' + rTier.name + ')';
      }
      return null;
    }
    if(s.nearBed){
      /* #66 床边睡眠: 优先于发射台提示 */
      var restN = (s.meta && s.meta.playerNeeds && s.meta.playerNeeds.rest!=null)
        ? s.meta.playerNeeds.rest : 100;
      return APH.Res.playerSleeping()
        ? '[E] 起床 (按方向键或受伤也会醒)'
        : '[E] 上床睡觉 (精力 '+Math.round(restN)+')';
    }
    if(s.nearClinic && (APH.Res.playerSleeping() || APH.Res.playerSick())){
      /* #70 医疗舱躺下 */
      var illN = (s.meta && s.meta.playerNeeds && s.meta.playerNeeds.illness!=null)
        ? s.meta.playerNeeds.illness : 0;
      return APH.Res.playerSleeping()
        ? '[E] 起床 (按方向键或受伤也会醒)'
        : '[E] 躺进医疗舱 (病情 '+Math.round(illN)+')';
    }
    if(s.nearFood && APH.Res.playerFood() < APH.Res.foodEatBelow()){
      /* #65 走到粮边吃 */
      var srcName65 = s.nearFood.isWarehouse ? '仓库口粮' : ((CFG.items[s.nearFood.itemId]||{}).name||'食物');
      return '[E] 吃 '+srcName65+' (饱食 '+Math.round(APH.Res.playerFood())+')';
    }
    if(s.nearKitchen){
      var kRec = (s.nearKitchen.recipe || 'it_roasted_meat');
      var kName = (APH.Colony.COOK_RECIPES[kRec] && APH.Colony.COOK_RECIPES[kRec].name) || kRec;
      return '烹饪灶台 · [F] 切换菜谱 (' + kName + ')';
    }
    if(s.nearCampfire){
      var cRec = (s.nearCampfire.recipe || 'it_roasted_meat');
      var cName = (APH.Colony.COOK_RECIPES[cRec] && APH.Colony.COOK_RECIPES[cRec].name) || cRec;
      return '石料篝火 · 取暖保暖 · [F] 切换配方 (' + cName + ')';
    }
    if(s.nearLab){
      var labRec = APH.Colony.recordOf(s.nearLab);
      var labT = (labRec && labRec.analysisTarget) || s.nearLab.analysisTarget || 'specimen_flora_glow';
      var labDef = APH.Colony.SPECIMEN_ANALYSIS[labT];
      var labNm = (labDef && labDef.name) || labT;
      var labHave = (s.meta.res && s.meta.res[labT]) || 0;
      var labProg = (labRec && labRec.analysisProgress != null) ? labRec.analysisProgress
        : (s.nearLab.analysisProgress || 0);
      var labPct = labDef ? Math.min(100, Math.floor(100*labProg/(labDef.craftTime||15))) : 0;
      return '科研站 · [F] 切换化验 ('+labNm+' '+labPct+'% · 库存×'+labHave+')';
    }
    if(s.nearCropPlot){
      var plotCrop = s.nearCropPlot.crop;
      var plotNm = (plotCrop && APH.Colony.ALIEN_CROPS[plotCrop] && APH.Colony.ALIEN_CROPS[plotCrop].name) || '未选定';
      return '种植圃 · [F] 切换已化验作物 ('+plotNm+')';
    }
    if(s.nearWorkshop){
      var wRec = s.nearWorkshop.recipe || 'it_pickaxe';
      var wName = (APH.Colony.CRAFT_RECIPES[wRec] && APH.Colony.CRAFT_RECIPES[wRec].name) || wRec;
      return '工坊 · [F] 切换配方 ('+wName+')';
    }
    if(s.nearCooler && !s.nearBrokenResident){
      return '[E] 切换空调模式: 当前为 ' + ((s.nearCooler.mode === 'freezer') ? '❄ 冷库模式 (-5°C)' : '🌤 避暑模式 (20°C)');
    }
    if(s.nearPad && !s.war.raidActive && !(s.war.raidWarn>0)){
      var shPad=APH.Colony.shortageBrief(s.meta, s.colony.buildings, APH.Colony.groundTally(s.entities));
      return '[E] 登船 · '+shPad.mission;
    }
    return null;
  }

  /* 最低一档: 目标提示 / 清掉已失效的旧提示。
     殖民地优先 T2: 第一夜由 opening 负责; 之后交给 colonyGoal 阶梯 ——
     以前这里过了第一夜就返回 null, 游戏从此再不向玩家要任何东西。 */
  function hintObjective(s){
    if(s.war.raidActive || (s.war.raidWarn>0)) return null;
    var buildings = (s.colony && s.colony.buildings) || [];
    var objH = window.APH.Opening && APH.Opening.objective
      ? APH.Opening.objective(s.meta&&s.meta.opening, buildings)
      : null;
    if(objH) return objH.text;
    /* T2 之后 colonyGoal 永不枯竭(兜底返回 endgame), 所以这里必定 return。
       原先它后面还跟着一段「旧提示失效就清空」的兜底 —— T2 落地那天起就
       再也走不到了, 是提示层独立成模块后才看出来的死代码, 已删。
       清空的效果没丢: 目标阶梯本身就会把残留的旧提示覆盖掉。 */
    var goal = APH.Colony.colonyGoal(s.meta, buildings);
    return goal && goal.text ? '◈ ' + goal.text : null;
  }

  function hintAncient(s){
    if(s.nearAncientVault){
      var vObj = s.nearAncientVault.vault || s.nearAncientVault;
      return vObj.opened ? '远古遗物箱 · 已开启' : '[E] 开启远古遗物箱';
    }
    if(s.nearAncientTerminal){
      var tObj = s.nearAncientTerminal.terminal || s.nearAncientTerminal;
      if(tObj.hacked) return '古代数据终端 · 破译完成 [系统已接管]';
      return '[E] 破译古代终端 (学识 Lv' + ((s.meta && s.meta.loreSkill) || 3) + ')';
    }
    if(s.nearAncientGate && s.nearAncientGate.gate && !s.nearAncientGate.gate.broken){
      return '[E] 破译能量闸门 (亦可用等离子枪轰击破门)';
    }
    return null;
  }

  function hintSelfState(s, env){
    var needs = env.needs;
    /* #72 家园击倒: 昏迷盖过一切 */
    if(needs && needs.downed && s.mode==='running'){
      return '击倒昏迷 · ' + (env.clinicB && env.hasRes72 ? '正在被送往医疗舱…' : '无人救援 · 生命垂危');
    }
    if(s.scene==='home' && !s.playerDrafted && APH.Res.playerFood() < APH.Res.foodEatBelow()){
      if(s.nearFood){
        var eatSrc = s.nearFood.isWarehouse ? '仓库口粮' : ((CFG.items[s.nearFood.itemId]||{}).name||'食物');
        return '🍽 正在进食 '+eatSrc+' (饱食 '+Math.round(APH.Res.playerFood())+')';
      }
      return APH.Colony.nearestMeal({x:s.px, y:s.py}, 1e9)
        ? '🍽 饥饿 · 指挥官正前往进食'
        : '🍽 没有口粮 · 请用【命令】标记浆果丛采摘，或远征带回食物';
    }
    if(APH.Res.playerSleeping()){
      return '😴 睡眠中 · 精力 '+Math.round((s.meta.playerNeeds&&s.meta.playerNeeds.rest)||0)+' · 征召或受伤可醒';
    }
    var sleepAt = (CFG.player&&CFG.player.restSleepAt)!=null?CFG.player.restSleepAt:20;
    if(s.scene==='home' && !s.playerDrafted && s.meta.playerNeeds && s.meta.playerNeeds.rest < sleepAt){
      return '😴 困了 · 正前往居住舱休息';
    }
    if(s.gathering && s.nearFlora){
      var gKind = s.nearFlora.kind || 'tree';
      var gName = gKind === 'tree' ? '树木' : (gKind.indexOf('rock')===0 ? '矿石' : '植株');
      var gPct = s.nearFlora.maxHp ? Math.max(0, Math.round(100 * s.nearFlora.hp / s.nearFlora.maxHp)) : 0;
      return '🪓 正在砍伐' + gName + ' · 剩余 ' + gPct + '%';
    }
    return null;
  }

  /* 家园提示优先级表 (高 → 低)。改优先级改这里, 不要再靠调用顺序。 */
  /* s: APH.state · env: simHome 这一跳算出的环境。
     返回要显示的字符串, 或 null = 「没意见, 屏幕保持原样」。 */
  function forHome(s, env){
    var h;
    /* 1. 物资告急: 最要命, 盖过一切 */
    if(env.quiet){
      var shH=APH.Colony.shortageBrief(s.meta, s.colony.buildings, APH.Colony.groundTally(s.entities));
      if(shH.urgent) return shH.text;
    }
    /* 2. 指挥官自身状态(昏迷/饥饿/睡眠/困倦/作业) */
    h = hintSelfState(s, env);
    if(h != null) return h;
    /* 3. 站在旁边能按键交互的东西 —— 玩家真正要用的提示 */
    h = hintNearbyThing(s);
    if(h != null) return h;
    /* 4. 远古遗迹(远征) */
    h = hintAncient(s);
    if(h != null) return h;
    /* 5. 环境播报: 治疗中 / 天气 —— 不许再盖掉上面的交互提示 */
    var healR=(CFG.player.clinicHealR!=null)?CFG.player.clinicHealR:80;
    if(env.clinicB && env.cDist<healR && s.hp<CFG.player.hpMax && env.quiet) return '医疗舱 · 缓慢治疗';
    if(env.weatherHint) return env.weatherHint;
    /* 6. 开场目标唠叨: 垫底, 没别的可说时才说 */
    return hintObjective(s);
  }

  return {
    forHome:forHome,
    nearbyThing:hintNearbyThing, objective:hintObjective,
    ancient:hintAncient, selfState:hintSelfState,
  };
})();
