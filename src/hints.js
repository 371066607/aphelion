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

  /* ADR-45: 原先这里有一长串「站在 X 旁边按 E 干什么」的提示 ——
     床/粮/发射台/工坊/灶台/科研站/种植圃/空调/货架/远古遗迹…
     没有化身之后它们全部失去意义: 环世界不靠走近提示, 靠选中小人下令。
     只剩两条真正与「走近」无关、而与「场上有谁」有关的:
       过客站在院子里(要不要招募) · 有人崩溃了(要不要安抚)。 */
  function hintNearbyThing(s){
    if(s.nearVisitor){
      var vp=s.nearVisitor.profile||s.nearVisitor;
      var skn=APH.Res.SKILL_NAMES[vp.mainSkill]||'';
      var intent=APH.Res.joinIntentOf(vp);
      var tag=intent==='refugee'?'难民':(intent==='trader'?'游商':'过路客');
      var imp=Math.round(s.nearVisitor.impression!=null?s.nearVisitor.impression:50);
      var ch=APH.Res.joinChance(vp, APH.Res.recruitCtx(s.nearVisitor));
      var extra=ch.ok
        ? (intent==='refugee'?' · 会留下':' · '+APH.Res.chanceLabel(ch.chance))
        : ' — '+ch.why;
      return (vp.name||'过客')+' · '+tag+
        (skn?' · '+skn+(vp.skills&&vp.skills[vp.mainSkill]||''):'')+
        (vp.trait?' · '+vp.trait:'')+extra+' · 印象'+imp;
    }
    if(s.nearBrokenResident){
      var bp = s.nearBrokenResident.resident;
      return '⚠ ' + (bp.name||'居民') + ' 正在 ' +
             (APH.Res.BREAK_NAMES[bp.breakType] || bp.breakType) + ' —— 派人去安抚';
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

  /* ADR-45: hintAncient / hintSelfState 已删 ——
     前者是「化身站在遗迹旁」, 后者是「化身自己饿不饿困不困」。 */

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
    /* 2. 场上有谁需要你处置(过客 / 崩溃者) */
    h = hintNearbyThing(s);
    if(h != null) return h;
    /* 3. 天气播报 */
    if(env.weatherHint) return env.weatherHint;
    /* 6. 开场目标唠叨: 垫底, 没别的可说时才说 */
    return hintObjective(s);
  }

  return {
    forHome:forHome,
    nearbyThing:hintNearbyThing, objective:hintObjective,
  };
})();
