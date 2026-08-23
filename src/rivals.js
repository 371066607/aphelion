/* ============================================================
   Aphelion · rivals.js — AI 殖民地 (Phase 4)
   挂载: window.APH.Rivals
   职责:
     - AI 殖民地成长 tick(纯函数): 经济/军事随时间增长, 个性决定曲线
     - 袭击决策(纯函数): 军事优势+时机 → 发动概率
     - warScore 态势值(纯函数): 双方军事/建筑/战果加权
   数据源: PlanetSpec.rivals (planet.js 已生成, LLM 可富化名字)
   ============================================================ */
window.APH = window.APH || {};

APH.Rivals = (function(){
  'use strict';
  var U=APH.U, CFG=APH.CFG;

  /* ---------- 个性成长系数 ---------- */
  var TRAITS={
    aggressive:    { eco:.6, mil:1.5, aggro:1.8 },
    expansionist:  { eco:1.2, mil:1.0, aggro:1.1 },
    trader:        { eco:1.5, mil:.55, aggro:.45 },
  };

  /* ---------- 成长 tick(纯函数) ----------
     每30游戏秒一跳(与殖民地生产同拍):
     rival { military, economy, trait } → 增长后的新对象 */
  function growthTick(rival, minutes){
    var k = TRAITS[rival.trait] || TRAITS.expansionist;
    var m = minutes||1;
    return Object.assign({}, rival, {
      economy: +(rival.economy + k.eco * m * .8).toFixed(1),
      military:+(rival.military + k.mil * m * .7).toFixed(1),
    });
  }

  /* ---------- 袭击决策(纯函数) ----------
     输入: AI军事 vs 玩家防御力(炮塔+士兵+科技加成的抽象值)
     输出: { shouldAttack, reason }
     规则:
       - AI军事 > 玩家防御×1.3 且 愤怒值满 → 攻
       - trader 性格几乎不主动攻 */
  function shouldRaid(rival, playerDef, angerMinutes){
    var k = TRAITS[rival.trait] || TRAITS.expansionist;
    if(rival.military < playerDef*1.3) return { should:false, reason:'军力不足' };
    var needAnger = 8 / k.aggro;                 // aggressive 4.4分钟, trader 17.8分钟
    if(angerMinutes < needAnger) return { should:false, reason:'时机未到' };
    return { should:true, reason:'优势打击' };
  }

  /* ---------- 战争态势 warScore (纯函数) ----------
     0~100, ≥50 玩家占优。输入双方军力与战果计数 */
  function warScore(rivalMil, playerMil, playerWins, playerRaids){
    var total = rivalMil + playerMil || 1;
    var base = playerMil/total*60;                       // 军力对比占60分
    var wins = Math.min(playerWins||0,10)*3;             // 防守胜 +3/次 (最多30)
    var raids = Math.min(playerRaids||0,5)*2;            // 掠夺成功 +2/次 (最多10)
    return Math.round(Math.max(0,Math.min(100, base+wins+raids)));
  }

  /* ---------- 袭击波次生成(纯函数) ----------
     按 AI 军力决定波次规模; 返回敌人 faction 权重表引用由调用方定,
     这里只产出数量配置 */
  function raidWave(rival){
    var m = rival.military;
    if(m<25)  return { count:3,  elite:false, label:'侦察袭扰' };
    if(m<50)  return { count:5,  elite:false, label:'正规袭击' };
    if(m<90)  return { count:7,  elite:true,  label:'重装突击' };
    return        { count:10, elite:true,  label:'全面进攻' };
  }

  return {
    TRAITS:TRAITS,
    growthTick:growthTick,
    shouldRaid:shouldRaid,
    warScore:warScore,
    raidWave:raidWave,
  };
})();
