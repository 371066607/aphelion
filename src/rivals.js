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
     rival { military, economy, trait } → 增长后的新对象
     D1: 若 cowedTime > 0 (畏缩期), 军力不增长 */
  function growthTick(rival, minutes, cowedTime){
    var k = TRAITS[rival.trait] || TRAITS.expansionist;
    var m = minutes||1;
    var isCowed = (cowedTime != null && cowedTime > 0);
    var newMil = isCowed ? rival.military : +(rival.military + k.mil * m * .7).toFixed(1);
    var newEco = +(rival.economy + k.eco * m * .8).toFixed(1);
    return Object.assign({}, rival, {
      economy: newEco,
      military: newMil,
    });
  }

  /* ---------- 势力外交与威慑 (ADR-17) ---------- */
  function defaultRelationOf(trait){
    var D = (CFG && CFG.diplomacy) || {};
    var map = D.defaultRelations || {};
    if(trait && map[trait] != null) return map[trait];
    return D.defaultRelationFallback != null ? D.defaultRelationFallback : -20;
  }

  function relationTierOf(relation){
    var D = (CFG && CFG.diplomacy) || {};
    var tiers = D.tiers || { hostile: -30, allied: 40 };
    var r = (relation != null) ? relation : (D.defaultRelationFallback != null ? D.defaultRelationFallback : -20);
    if(r < tiers.hostile) return 'hostile';
    if(r > tiers.allied) return 'allied';
    return 'neutral';
  }

  /* 纳贡平息 (纯函数): 扣除指定建材/资源, 增加关系度, 扣减怒气, 撤销 wantRaid */
  function sendTribute(rivalState, resType, availableAmount){
    var D = (CFG && CFG.diplomacy) || {};
    var tributes = D.tributes || {};
    var tDef = tributes[resType];
    if(!tDef) return { success:false, reason:'未知纳贡资源类型' };
    var cost = tDef.cost;
    if((availableAmount || 0) < cost) return { success:false, reason:'资源不足: 需要 '+cost };
    var trait = rivalState.rival && rivalState.rival.trait;
    var curRel = (rivalState.relation != null) ? rivalState.relation : defaultRelationOf(trait);
    var newRel = Math.min(100, curRel + tDef.relationGain);
    var newAnger = Math.max(0, (rivalState.anger || 0) - tDef.angerCalm);
    var next = Object.assign({}, rivalState, {
      relation: newRel,
      anger: newAnger,
      wantRaid: false
    });
    return { success:true, cost:cost, resType:resType, newState:next };
  }

  /* 签署通商协定 (纯函数): 需中立及以上(relation >= minRelation), 消耗矿石 */
  function signTradePact(rivalState, mineralStock){
    var D = (CFG && CFG.diplomacy) || {};
    var P = D.tradePact || { minRelation:0, costMineral:20 };
    var trait = rivalState.rival && rivalState.rival.trait;
    var curRel = (rivalState.relation != null) ? rivalState.relation : defaultRelationOf(trait);
    if(curRel < P.minRelation) return { success:false, reason:'关系度需达到 '+P.minRelation };
    if((mineralStock || 0) < P.costMineral) return { success:false, reason:'矿石不足: 需要 '+P.costMineral };
    var next = Object.assign({}, rivalState, {
      pact: true,
      relation: Math.min(100, curRel + 10)
    });
    return { success:true, cost:P.costMineral, newState:next };
  }

  /* 军事威慑 (纯函数): 玩家防御力 >= 敌军力 × defRatio 时生效, 陷入畏缩并打消 wantRaid */
  function deterRival(rivalState, playerDef){
    var D = (CFG && CFG.diplomacy) || {};
    var det = D.deterrence || { defRatio: 1.2, duration: 300 };
    var mil = (rivalState.rival && rivalState.rival.military) || 10;
    var need = mil * det.defRatio;
    if((playerDef || 0) < need) return { success:false, reason:'防御不足: 需要防御力 '+need.toFixed(0) };
    var next = Object.assign({}, rivalState, {
      cowedTime: det.duration,
      wantRaid: false
    });
    return { success:true, newState:next };
  }

  /* 远征基地击毁重创 (纯函数): 军力扣 30%, 怒气清零, 撤销 wantRaid, 陷入畏缩, 扣减关系 */
  function applyBaseRaid(rivalState){
    var D = (CFG && CFG.diplomacy) || {};
    var cutDef = D.baseRaidDamage || { milCut: 0.3, cowedSec: 180, relationPenalty: 15 };
    var mil = (rivalState.rival && rivalState.rival.military) || 10;
    var cut = Math.round(mil * cutDef.milCut);
    var newMil = Math.max(5, +(mil - cut).toFixed(1));
    var newRival = Object.assign({}, rivalState.rival, { military: newMil });
    var trait = rivalState.rival && rivalState.rival.trait;
    var curRel = (rivalState.relation != null) ? rivalState.relation : defaultRelationOf(trait);
    return Object.assign({}, rivalState, {
      rival: newRival,
      anger: 0,
      wantRaid: false,
      cowedTime: cutDef.cowedSec,
      relation: Math.max(-100, curRel - cutDef.relationPenalty)
    });
  }

  /* ---------- 袭击决策(纯函数) ----------
     输入: AI军事 vs 玩家防御力(炮塔+士兵+科技加成的抽象值)
     D1 升级: 支持 relation 和 cowedTime
     规则:
       - 处于畏缩期(cowedTime > 0) → 绝不袭
       - 盟友关系(tier === 'allied') → 绝不袭
       - 中立关系 → 需 1.5 倍军力且怒气要求 ×1.5
       - 宿敌关系 → 需 1.3 倍军力且怒气蓄满 → 袭
       - trader 性格几乎不主动攻 */
  function shouldRaid(rival, playerDef, angerMinutes, relation, cowedTime){
    if(cowedTime != null && cowedTime > 0) return { should:false, reason:'处于畏缩状态' };

    var D = (CFG && CFG.diplomacy) || {};
    var needRatio = 1.3;
    var angerMul = 1.0;

    if(relation != null){
      var tier = relationTierOf(relation);
      if(tier === 'allied') return { should:false, reason:'盟友关系' };
      if(tier === 'neutral'){
        needRatio = D.neutralRaidMul || 1.5;
        angerMul = D.neutralAngerMul || 1.5;
      }
    }

    if(rival.military < playerDef * needRatio) return { should:false, reason:'军力不足' };

    var k = TRAITS[rival.trait] || TRAITS.expansionist;
    var needAnger = (8 / k.aggro) * angerMul;
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
     这里只产出数量配置。
     阶段E: 追加 tactic(按 trait 分流: 强攻/盗掠/围攻) 与 waves
     (军力 ≥ bigWaveAt 拆两波, count 为单波数量)。旧字段签名不变。 */
  function tacticOf(trait){
    var RT=CFG.raidTactics||{};
    var map=RT.byTrait||{};
    return map[trait]||'assault';
  }
  function raidWave(rival){
    var RT=CFG.raidTactics||{};
    var m = rival.military;
    var base;
    if(m<25)       base={ count:3,  elite:false, label:'侦察袭扰' };
    else if(m<50)  base={ count:5,  elite:false, label:'正规袭击' };
    else if(m<90)  base={ count:7,  elite:true,  label:'重装突击' };
    else           base={ count:10, elite:true,  label:'全面进攻' };
    var tac=tacticOf(rival.trait);
    var t=(RT.tactics&&RT.tactics[tac])||{};
    base.tactic=tac;
    base.count=Math.max(1, Math.round(base.count*(t.countMul!=null?t.countMul:1)));
    if(t.label) base.label=t.label+'·'+base.label;
    if(m >= (RT.bigWaveAt!=null?RT.bigWaveAt:90)){
      base.waves=2;
      base.count=Math.max(1, Math.ceil(base.count/2));  // count=单波数量
    }else{
      base.waves=1;
    }
    base.total=base.count*base.waves;                   // 全袭击总兵力
    return base;
  }

  return {
    TRAITS:TRAITS,
    growthTick:growthTick,
    shouldRaid:shouldRaid,
    warScore:warScore,
    raidWave:raidWave,
    defaultRelationOf:defaultRelationOf,
    relationTierOf:relationTierOf,
    sendTribute:sendTribute,
    signTradePact:signTradePact,
    deterRival:deterRival,
    applyBaseRaid:applyBaseRaid,
  };
})();
