/* ============================================================
   Aphelion · residents.js — 殖民者系统 (P6, 用户方向)
   挂载: window.APH.Res
   愿景: 殖民地是有人生活的家。
   - U1 居民数据: 六维技能 + 心情 + 饱食 + 病情
   - 纯函数优先(node 可测), 世界侧接线在 main.js
   ============================================================ */
window.APH = window.APH || {};

APH.Res = (function(){
  'use strict';
  var U=APH.U, CFG=APH.CFG;

  /* ---------- 技能定义 (ADR-9 前缀 sk_) ---------- */
  var SKILLS=['sk_build','sk_farm','sk_ranch','sk_craft','sk_lore','sk_social'];
  var SKILL_NAMES={
    sk_build:'建造', sk_farm:'种植', sk_ranch:'畜牧',
    sk_craft:'手工', sk_lore:'学识', sk_social:'社交',
  };

  /* ---------- 名字池(seeded 随机) ---------- */
  var FIRST=['阿澈','布兰','青禾','老周','米娅','石头','晚星','卡帕','冬青','阿岚',
             '铁蛋','白芷','洛尘','苏木','小满','远山','阿枝','格里','云杉','南絮'];
  var LAST=['·一号','·二号','·三号','·四号','·五号','·六号','·七号','·八号'];
  var ORIGINS=['地球难民船','第一代殖民者','轨道站出生','冷冻舱幸存者','游商后代','本地出生'];

  /* ---------- U1: 居民生成(纯函数) ----------
     每人: 一个主技能(高) + 一个副技能(中) + 其余低;
     心情/饱食度初始健康。 */
  function generate(id, seed, takenNames){
    var rng=U.makeRng(seed);
    function pick(a){ return a[Math.floor(rng()*a.length)]; }
    /* 主副技能不重复 */
    var origin=pick(ORIGINS);
    var main=SKILLS[Math.floor(rng()*SKILLS.length)];
    var sub=main;
    while(sub===main) sub=SKILLS[Math.floor(rng()*SKILLS.length)];
    var skills={};
    SKILLS.forEach(function(sk){
      if(sk===main) skills[sk]=6+Math.floor(rng()*4);        // 主 6~9
      else if(sk===sub) skills[sk]=3+Math.floor(rng()*3);    // 副 3~5
      else skills[sk]=Math.floor(rng()*3);                   // 其余 0~2
    });
    return {
      id:'rs_'+id,
      name:(function(){
        /* V2 唯一性: 与已用名组合去重 */
        var used=takenNames||[], nm;
        for(var tries=0; tries<40; tries++){
          nm=pick(FIRST)+pick(LAST);
          if(used.indexOf(nm)<0) return nm;
        }
        return nm+'·'+id;                        // 兜底: 附id保证唯一
      })(),
      origin:origin,
      skills:skills, mainSkill:main, subSkill:sub,
      mood:70+Math.floor(rng()*25),                          // 70~94
      food:80+Math.floor(rng()*15),                          // 80~94
      illness:0,                                             // 病情 0~100 (F: ailments 聚合值)
      ailments:[],                                           // F: [{type,sev,age}] 最多 ailMax 条
      job:null,                                              // 指派岗位 bl_xxx|null
      trait:pick(['勤恳','话痨','独行','乐观','谨慎','暴脾气']),
      arrivedAt:0,
    };
  }

  function RS(){ return (CFG.residents)||{}; }
  function clampNeed(v, lo, hi){
    return Math.max(lo, Math.min(hi, v));
  }

  /* ---------- U4: 饱食/心情/病情 tick(纯函数) ----------
     每30游戏秒一跳: 掉饱食; 真吃饭在走位里(仓/地上堆). 饿→心情掉且涨病; 不饿死. */
  function needsTick(r, hasFood){
    var C=RS();
    var out={ ate:false };
    r.illness = r.illness||0;
    var eatBelow=C.eatBelow!=null?C.eatBelow:60;
    var eatGain=C.eatGain!=null?C.eatGain:25;
    var drain=C.foodDrain!=null?C.foodDrain:6;
    if(r.food<eatBelow && hasFood){
      r.food=Math.min(100,r.food+eatGain); out.ate=true;
    }else{
      r.food=Math.max(0,r.food-drain);
    }
    var sickAt=C.hungerSickAt!=null?C.hungerSickAt:30;
    var sickAdd=C.hungerSick!=null?C.hungerSick:4;
    if(r.food<sickAt) addAilment(r, 'wound', sickAdd);        // 饿出的病=外伤
    var wellF=C.moodWellFood!=null?C.moodWellFood:65;
    var wellG=C.moodWellGain!=null?C.moodWellGain:2;
    var cap=C.moodCap!=null?C.moodCap:95;
    var stAt=C.moodStarveAt!=null?C.moodStarveAt:30;
    var stN=C.moodStarve!=null?C.moodStarve:8;
    var hgAt=C.moodHungryAt!=null?C.moodHungryAt:45;
    var hgN=C.moodHungry!=null?C.moodHungry:3;
    if(r.food>wellF && r.mood<cap) r.mood+=wellG;
    else if(r.food<stAt) r.mood=Math.max(0,r.mood-stN);
    else if(r.food<hgAt) r.mood=Math.max(0,r.mood-hgN);
    var moodSickAt=C.moodSickAt!=null?C.moodSickAt:40;
    var moodSick=C.moodSick!=null?C.moodSick:3;
    if(r.illness>moodSickAt) r.mood=Math.max(0, r.mood-moodSick);
    return out;
  }

  /* 走到粮堆/仓库后吃一口. 生产跳只掉饱食, 不隔空扣地上. */
  function eatOnce(r){
    var C=RS();
    var below=C.eatBelow!=null?C.eatBelow:60;
    var gain=C.eatGain!=null?C.eatGain:25;
    if(!r || r.food==null || r.food>=below) return false;
    r.food=Math.min(100, (r.food||0)+gain);
    return true;
  }

  /* 工作效率系数: 心情 × 饱食 × 病情(超阈值打折, 有地板) */
  function efficiency(r){
    var C=RS();
    var moodF=0.55+(r.mood/100)*0.75;                         // 0.55~1.30
    var foodF=r.food>=50?1:(0.5+r.food/100);                  // <50 开始打折
    var ill=r.illness||0;
    var at=C.effSickAt!=null?C.effSickAt:20;
    var floor=C.effSickFloor!=null?C.effSickFloor:0.35;
    /* F: 感染的效率地板更低 */
    var infected=false;
    (r.ailments||[]).forEach(function(a){ if(a.type==='infection') infected=true; });
    if(infected) floor=C.effInfectFloor!=null?C.effInfectFloor:0.25;
    var sickF=1;
    if(ill>at) sickF=Math.max(floor, 1-(ill-at)/100);
    return Math.round(moodF*foodF*sickF*100)/100;
  }

  /* ---------- F: 健康分型 (ailments 数组) ----------
     illness 保留为聚合值(= 各 ailment sev 之和 clamp illnessMax),
     所有现有公式(efficiency/moodSick)零改动; 得病/治疗入口改为操作 ailments。
     分型: wound 外伤(自愈快) / infection 感染(不自愈, 拖出来的)
           / plague 疫病(医疗舱只能压到地板, 必须用药除根)。 */
  var AILMENT_NAMES={ wound:'外伤', infection:'感染', plague:'疫病' };
  var TREAT_ORDER={ infection:0, plague:1, wound:2 };   // 医疗舱治疗优先级

  /* 兼容旧档/外部直改 illness: 无数组按 wound 初始化;
     聚合值与数组失配时按比例校准数组(illness 是唯一对外真值) */
  function ensureAilments(r){
    if(!r.ailments){
      r.ailments=(r.illness||0)>0 ? [{type:'wound', sev:Math.round(r.illness), age:0}] : [];
      return r.ailments;
    }
    var sum=0;
    r.ailments.forEach(function(a){ sum+=a.sev||0; });
    sum=Math.round(sum);
    var ill=Math.round(r.illness||0);
    if(sum!==ill){
      if(ill<=0) r.ailments=[];
      else if(sum<=0) r.ailments=[{type:'wound', sev:ill, age:0}];
      else{
        var k=ill/sum;
        r.ailments.forEach(function(a){ a.sev=Math.max(0, a.sev*k); });
      }
    }
    return r.ailments;
  }
  function syncIllness(r){
    var C=RS();
    var illMax=C.illnessMax!=null?C.illnessMax:100;
    r.ailments=(r.ailments||[]).filter(function(a){ return (a.sev||0)>0.5; });
    var sum=0;
    r.ailments.forEach(function(a){ sum+=a.sev||0; });
    r.illness=clampNeed(Math.round(sum), 0, illMax);
    return r.illness;
  }
  /* 得病入口: 同型合并; 最多 ailMax 条, 满了加到最重的一条 */
  function addAilment(r, type, sev){
    if(!r || !sev) return r;
    var C=RS();
    var max=C.ailMax!=null?C.ailMax:2;
    ensureAilments(r);
    var same=null;
    r.ailments.forEach(function(a){ if(a.type===type) same=a; });
    if(same){
      same.sev=clampNeed(same.sev+sev, 0, 100);
    }else if(r.ailments.length<max){
      r.ailments.push({type:type, sev:clampNeed(sev,0,100), age:0});
    }else{
      var worst=r.ailments[0];
      r.ailments.forEach(function(a){ if(a.sev>worst.sev) worst=a; });
      worst.sev=clampNeed(worst.sev+sev, 0, 100);
    }
    syncIllness(r);
    return r;
  }
  /* 治疗入口: 医疗舱按 感染>疫病>外伤 取靶; 用药(isMed)优先疫病且效果×2;
     无药时疫病只能压到 plagueFloor(压不能除) */
  function treatAilment(r, amount, isMed){
    ensureAilments(r);
    if(!r.ailments.length || !amount){ syncIllness(r); return null; }
    var C=RS();
    var tgt=null;
    if(isMed){
      r.ailments.forEach(function(a){ if(a.type==='plague') tgt=a; });
    }
    if(!tgt){
      tgt=r.ailments.slice().sort(function(a,b){
        return (TREAT_ORDER[a.type]!=null?TREAT_ORDER[a.type]:9)
             - (TREAT_ORDER[b.type]!=null?TREAT_ORDER[b.type]:9);
      })[0];
    }
    var amt=amount;
    if(tgt.type==='plague'){
      if(isMed){
        amt*=(C.medPlagueMul!=null?C.medPlagueMul:2);
        tgt.sev=Math.max(0, tgt.sev-amt);
      }else{
        var fl=C.plagueFloor!=null?C.plagueFloor:12;
        tgt.sev=Math.max(Math.min(fl,tgt.sev), tgt.sev-amt);
      }
    }else{
      tgt.sev=Math.max(0, tgt.sev-amt);
    }
    var t=tgt.type;
    syncIllness(r);
    return t;
  }
  /* 病程推进(每生产跳): 外伤 age≥woundInfectAge 且本人未进医疗舱 → 升级感染 */
  function ailmentAge(r, ctx){
    ctx=ctx||{};
    var C=RS();
    ensureAilments(r);
    var inClinic = ctx.inClinic;
    if(inClinic==null) inClinic=!!ctx.hasClinic;   // 单测无坐标时回退
    var upgraded=null;
    r.ailments.forEach(function(a){
      a.age=(a.age||0)+1;
      if(a.type==='wound' && !inClinic &&
         a.age>=(C.woundInfectAge!=null?C.woundInfectAge:2) && a.sev>0.5){
        a.type='infection'; a.age=0;
        a.sev=clampNeed(a.sev+(C.infectBump!=null?C.infectBump:5), 0, 100);
        upgraded=a;
      }
    });
    if(upgraded) r.mood=Math.max(0, (r.mood||0)-(C.infectMood!=null?C.infectMood:8));
    syncIllness(r);
    return upgraded ? { upgraded:upgraded.type } : {};
  }

  /* 医疗舱治疗(每生产跳): 有舱基疗, 有医更快; 无舱且吃饱只自愈外伤;
     否则少量 ambient 得病(计为感染); 最后推进病程 */
  function clinicTick(r, ctx){
    ctx = ctx||{};
    var C=RS();
    ensureAilments(r);
    if(ctx.hasClinic){
      var heal = C.clinicHeal!=null?C.clinicHeal:6;
      var sk=ctx.medicSkill||0;
      if(sk>0)       heal += (C.medicHealPerLv!=null?C.medicHealPerLv:1.2)*sk;
      treatAilment(r, heal, false);
    }else{
      var well=C.selfHealFood!=null?C.selfHealFood:65;
      if((r.food||0)>=well){
        /* F: 自愈只作用于外伤——感染要进舱, 疫病要用药 */
        var self=C.selfHeal!=null?C.selfHeal:1;
        var w=null;
        r.ailments.forEach(function(a){ if(a.type==='wound') w=a; });
        if(w){ w.sev=Math.max(0, w.sev-self); syncIllness(r); }
      }else{
        var rng = ctx.rng || Math.random;
        var chance=C.ambientSickChance!=null?C.ambientSickChance:0.08;
        var add=C.ambientSick!=null?C.ambientSick:2;
        if(rng()<chance) addAilment(r, 'wound', add);
      }
    }
    ailmentAge(r, ctx);
    return r;
  }

  /* 袭击打伤(纯函数): 涨病、掉心情, 不致死。type 默认 wound(疫病事件传 'plague')
     opts.mood: 覆盖心情打击; false=不掉心情(斗殴自伤只加病) */
  function hurtResident(r, amount, type, opts){
    if(!r) return r;
    if(type && typeof type==='object'){ opts=type; type='wound'; }
    opts=opts||{};
    var C=RS();
    var wound=amount!=null?amount:(C.raidWound!=null?C.raidWound:18);
    addAilment(r, type||'wound', wound);
    if(opts.mood!==false){
      var moodHit=opts.mood!=null?opts.mood:(C.raidMood!=null?C.raidMood:12);
      r.mood=Math.max(0, (r.mood||0)-moodHit);
    }
    return r;
  }

  /* 用药(纯函数): 优先根治疫病(×medPlagueMul), 否则按治疗优先级 */
  function applyMed(r){
    if(!r) return r;
    var C=RS();
    var bonus=C.medHeal!=null?C.medHeal:8;
    treatAilment(r, bonus, true);
    return r;
  }

  /* ---------- 心情崩溃(RimWorld mental break, 纯函数) ----------
     心情跌破阈值 → 掷骰进入崩溃; 崩溃类型按性格分流;
     结束时宣泄回弹(mood 至少回 breakRecoverMood) + 进冷却。
     时间单位 = 生产跳(30s)。字段: breakType/breakT/breakCd 随名册落盘。 */
  var BREAK_BY_TRAIT={
    '暴脾气':'brawl', '独行':'wander', '谨慎':'wander',
    '话痨':'tantrum', '乐观':'tantrum', '勤恳':'binge',
  };
  var BREAK_NAMES={ brawl:'斗殴', wander:'出走', tantrum:'怠工抱怨', binge:'暴食' };
  function breakTypeOf(trait){ return BREAK_BY_TRAIT[trait]||'wander'; }
  function isBroken(r){ return !!(r && r.breakType && (r.breakT||0)>0); }
  /* 每生产跳一调: 推进崩溃状态机。返回 {started}|{ongoing}|{ended}|{} */
  function breakTick(r, rng){
    if(!r) return {};
    var C=RS();
    var rand=rng||Math.random;
    if((r.breakCd||0)>0) r.breakCd--;
    if(isBroken(r)){
      r.breakT--;
      if(r.breakT<=0){
        var t=r.breakType;
        r.breakType=null; r.breakT=0;
        r.breakCd=C.breakCdTicks!=null?C.breakCdTicks:10;
        var rec=C.breakRecoverMood!=null?C.breakRecoverMood:45;
        r.mood=Math.max(r.mood||0, rec);                 // 宣泄回弹
        return { ended:t };
      }
      return { ongoing:r.breakType };
    }
    var minor=C.breakMinorAt!=null?C.breakMinorAt:35;
    var major=C.breakMajorAt!=null?C.breakMajorAt:15;
    if((r.mood||0)>=minor || (r.breakCd||0)>0) return {};
    var p=(C.breakChance!=null?C.breakChance:0.08)
        * ((r.mood||0)<major ? (C.breakMajorMul!=null?C.breakMajorMul:3) : 1);
    if(rand()>=p) return {};
    r.breakType=breakTypeOf(r.trait);
    var lo=C.breakTicksMin!=null?C.breakTicksMin:1;
    var hi=C.breakTicksMax!=null?C.breakTicksMax:2;
    r.breakT=lo+Math.floor(rand()*(hi-lo+1));
    return { started:r.breakType, ticks:r.breakT };
  }
  /* 斗殴对象: 好感最低的同事(无记录按 50 算) */
  function lowestBondMate(r, residents, bonds){
    var best=null, bv=1e9;
    (residents||[]).forEach(function(o){
      if(!o || o===r || o.id===r.id) return;
      var k=r.id<o.id ? r.id+'|'+o.id : o.id+'|'+r.id;
      var v=(bonds && bonds[k]!=null) ? bonds[k] : 50;
      if(v<bv){ bv=v; best=o; }
    });
    return best;
  }

  /* ---------- U7: 社交关系(纯函数) ---------- */
  /* 同岗位共事 → 好感缓增; 性格冲突(暴脾气×任意)随机矛盾 */
  function socialTick(pairs){
    // pairs: [{a,b,sameJob}] → 返回好感增量数组
    return pairs.map(function(p){
      var d=p.sameJob? +1.5 : +0.4;
      if(p.a.trait==='暴脾气'||p.b.trait==='暴脾气'){
        d -= (p.a.mood<40||p.b.mood<40)? 3 : 1;               // 低心情时暴躁引发矛盾
      }
      return { a:p.a.id, b:p.b.id, delta:d };
    });
  }
  function applyBond(bonds, aId, bId, delta){
    var k=aId<bId? aId+'|'+bId : bId+'|'+aId;
    bonds[k]=(bonds[k]||50)+delta;                            // 初始50, 范围0~100
    bonds[k]=Math.max(0,Math.min(100,bonds[k]));
    return bonds;
  }

  /* ---------- V1 全局加成(纯函数) ----------
     建造: 建筑费用 -12%/级 (取最高建造技能者)
     学识: 每生产跳额外研究点 = 0.5×最高学识
     社交: 每跳全殖民者心情 +0.3×最高社交(上限+2) */
  function globalBonuses(residents){
    var best={};
    SKILLS.forEach(function(sk){
      best[sk]=residents.reduce(function(acc,r){
        return Math.max(acc, r.skills[sk]||0);
      },0);
    });
    var TC=CFG.trade||{};
    var perLv=TC.socialPricePerLv!=null?TC.socialPricePerLv:0.02;
    var cap=TC.socialPriceCap!=null?TC.socialPriceCap:0.12;
    return {
      buildCostMul: Math.max(.4, 1 - best.sk_build*0.12),
      lorePerTick : best.sk_lore*0.5,
      moodBoost   : Math.min(2, best.sk_social*0.3),
      tradeMul    : Math.min(cap, best.sk_social*perLv),
    };
  }

  /* ---------- 过客招募(RimWorld 式: 看人下菜, 不买人) ----------
     难民(地球难民船/冷冻舱)有床且现有人口没断粮 → 必成
     游商后代 → 不招
     过路客 → 掷骰, 看粮/医疗/岗位/性格/袭击 */
  var REFUGEE_ORIGINS=['地球难民船','冷冻舱幸存者'];
  var TRADER_ORIGINS=['游商后代'];
  var SKILL_JOB={
    sk_farm:'bl_farm', sk_ranch:'bl_pasture', sk_craft:'bl_mine',
    sk_lore:'bl_lab', sk_build:'bl_house', sk_social:'bl_clinic',
  };
  function joinIntentOf(profile){
    if(!profile) return 'none';
    if(TRADER_ORIGINS.indexOf(profile.origin)>=0) return 'trader';
    if(REFUGEE_ORIGINS.indexOf(profile.origin)>=0) return 'refugee';
    return 'guest';
  }
  function RC(){ return (CFG.recruit)||{}; }
  function hasBldg(buildings, id){
    return (buildings||[]).some(function(b){ return b && b.id===id; });
  }
  function recruitGate(profile, ctx){
    ctx = ctx || {};
    if(!profile) return { ok:false, why:'没有过客', intent:'none', chance:0 };
    var intent=joinIntentOf(profile);
    if((ctx.housingCap||0) <= (ctx.residentCount||0))
      return { ok:false, why:'住宅已满', intent:intent, chance:0 };
    if(intent==='trader')
      return { ok:false, why:'只做买卖，不愿留下', intent:intent, chance:0 };
    if(intent==='refugee' && (ctx.residentCount||0)>0 && (ctx.food||0) < (ctx.residentCount||0))
      return { ok:false, why:'没粮，难民不敢留下', intent:intent, chance:0 };
    return { ok:true, intent:intent };
  }
  function joinChance(profile, ctx){
    ctx = ctx || {};
    var gate=recruitGate(profile, ctx);
    if(!gate.ok) return { chance:0, intent:gate.intent, why:gate.why, ok:false };
    if(gate.intent==='refugee') return { chance:100, intent:'refugee', ok:true };
    var C=RC();
    var chance=C.guestBase!=null ? C.guestBase : 45;
    var trait=profile.trait;
    if(trait==='乐观'||trait==='勤恳') chance += (C.traitEasy!=null?C.traitEasy:12);
    if(trait==='独行'||trait==='谨慎') chance -= (C.traitHard!=null?C.traitHard:15);
    if(trait==='暴脾气') chance -= (C.traitAngry!=null?C.traitAngry:10);
    var pop=(ctx.residentCount||0)+1;
    var days=pop ? Math.floor((ctx.food||0)/Math.max(1,pop)) : (ctx.food||0);
    var goodT=C.foodGoodTicks!=null ? C.foodGoodTicks : 3;
    if(days>=goodT) chance += (C.foodGood!=null?C.foodGood:20);
    else if(days<1) chance -= (C.foodBad!=null?C.foodBad:30);
    if(hasBldg(ctx.buildings, 'bl_clinic')) chance += (C.clinic!=null?C.clinic:10);
    var jobId=SKILL_JOB[profile.mainSkill];
    var jobOk=jobId && hasBldg(ctx.buildings, jobId);
    if(profile.mainSkill==='sk_craft' && hasBldg(ctx.buildings, 'bl_workshop')) jobOk=true;
    if(jobOk) chance += (C.jobBldg!=null?C.jobBldg:10);
    if(ctx.raidActive) chance -= (C.raid!=null?C.raid:40);
    if(ctx.impression!=null) chance += Math.round((ctx.impression-50)/2);
    var lo=C.chanceMin!=null?C.chanceMin:5, hi=C.chanceMax!=null?C.chanceMax:95;
    chance=Math.max(lo, Math.min(hi, chance));
    return { chance:chance, intent:'guest', ok:true };
  }
  function chanceLabel(n){
    if(n>=80) return '几乎会留下';
    if(n>=60) return '大约六成';
    if(n>=40) return '五五开';
    if(n>=20) return '不太情愿';
    return '很难开口';
  }
  function canRecruit(profile, residentCount, housingCap, ctx){
    ctx = Object.assign({
      residentCount:residentCount, housingCap:housingCap, food:999, buildings:[]
    }, ctx||{});
    ctx.residentCount = residentCount;
    ctx.housingCap = housingCap;
    var gate=recruitGate(profile, ctx);
    if(!gate.ok) return gate;
    var ch=joinChance(profile, ctx);
    return { ok:true, why:'', intent:ch.intent, chance:ch.chance };
  }
  function recruitInto(meta, profile, housingCap, ctx){
    meta.residents = meta.residents || [];
    ctx = Object.assign({
      residentCount: meta.residents.length, housingCap:housingCap,
      food:999, buildings:[]
    }, ctx||{});
    ctx.residentCount = meta.residents.length;
    ctx.housingCap = housingCap;
    var gate=recruitGate(profile, ctx);
    if(!gate.ok) return gate;
    var r = Object.assign({}, profile, { job:null, jobLocked:false });
    meta.residents.push(r);
    return { ok:true, resident:r, intent:gate.intent };
  }
  function attemptRecruit(meta, profile, ctx, rng){
    ctx = ctx || {};
    var gate=recruitGate(profile, ctx);
    if(!gate.ok) return gate;
    var ch=joinChance(profile, ctx);
    var roll = (rng || Math.random)() * 100;
    if(ch.chance>=100 || roll < ch.chance)
      return Object.assign(recruitInto(meta, profile, ctx.housingCap, ctx), { chance:ch.chance, rolled:roll });
    return { ok:false, why:'还想再看看', chance:ch.chance, intent:ch.intent, rolled:roll };
  }
  /* 招待印象: 50 中立; 有空床/余粮/医疗舱涨, 断粮/袭击掉 */
  function hospitalityRate(ctx){
    ctx = ctx || {};
    var C=RC();
    var d=0;
    var spare=(ctx.housingCap||0)>(ctx.residentCount||0);
    if(spare) d += (C.rateSpareBed!=null?C.rateSpareBed:0.4);
    else d -= (C.rateNoBed!=null?C.rateNoBed:0.12);
    var pop=Math.max(1,(ctx.residentCount||0)+1);
    var days=Math.floor((ctx.food||0)/pop);
    var goodT=C.foodGoodTicks!=null?C.foodGoodTicks:3;
    if(days>=goodT) d += (C.rateFoodOk!=null?C.rateFoodOk:0.28);
    else if((ctx.food||0)<1) d -= (C.rateNoFood!=null?C.rateNoFood:0.55);
    if(hasBldg(ctx.buildings,'bl_clinic')) d += (C.rateClinic!=null?C.rateClinic:0.18);
    if(ctx.raidActive) d -= (C.rateRaid!=null?C.rateRaid:1.1);
    return d;
  }
  function tickImpression(cur, dt, ctx){
    var C=RC();
    var lo=C.impressMin!=null?C.impressMin:0;
    var hi=C.impressMax!=null?C.impressMax:100;
    var start=C.impressStart!=null?C.impressStart:50;
    var v=(cur==null?start:cur) + hospitalityRate(ctx)*(dt||0);
    return Math.max(lo, Math.min(hi, v));
  }
  function offerMeal(meta, visitor, cost){
    var C=RC();
    var need=cost!=null?cost:(C.mealCost!=null?C.mealCost:2);
    var boost=C.mealImpress!=null?C.mealImpress:20;
    var start=C.impressStart!=null?C.impressStart:50;
    var hi=C.impressMax!=null?C.impressMax:100;
    if(!visitor) return { ok:false, why:'没有过客' };
    if(visitor.fed) return { ok:false, why:'已经请过客吃过了' };
    meta = meta || {};
    meta.res = meta.res || { food:0 };
    if((meta.res.food||0)<need) return { ok:false, why:'食物不够请客' };
    meta.res.food=(meta.res.food||0)-need;
    visitor.fed=true;
    visitor.impression=Math.min(hi, (visitor.impression==null?start:visitor.impression)+boost);
    return { ok:true, impression:visitor.impression, food:meta.res.food, cost:need };
  }

  /* D: 默认工作优先级——有现职按岗位对应技能=1, 否则主技能=1, 其余=2 */
  function defaultPrio(r){
    var p={};
    SKILLS.forEach(function(sk){ p[sk]=2; });
    var jobSk=null;
    if(r && r.job && window.APH.Colony && APH.Colony.JOB_SKILL)
      jobSk=APH.Colony.JOB_SKILL[r.job];
    if(jobSk && p[jobSk]!=null) p[jobSk]=1;
    else if(r && r.mainSkill && p[r.mainSkill]!=null) p[r.mainSkill]=1;
    return p;
  }

  /* ---------- C: 游商贸易(矿材=硬通货, 纯函数) ----------
     stock: { sells:[{key,n,price}], buys:[{key,n,price}] }
     key 用仓储字段(food/leather/med); 价格 seeded 浮动 ±priceJitter。 */
  function TR(){ return CFG.trade||{}; }
  function makeTraderStock(seed){
    var C=TR();
    var rng=U.makeRng((seed||1)>>>0);
    var jit=C.priceJitter!=null?C.priceJitter:0.25;
    var lo=C.stockMin!=null?C.stockMin:2, hi=C.stockMax!=null?C.stockMax:6;
    var extra=C.demandExtra!=null?C.demandExtra:2;
    var nLo=C.listMin!=null?C.listMin:2, nHi=C.listMax!=null?C.listMax:3;
    function jPrice(base){ return Math.max(1, Math.round(base*(1+(rng()*2-1)*jit))); }
    function nStock(add){ return lo+add+Math.floor(rng()*(hi-lo+1)); }
    function pickKeys(obj){
      var keys=Object.keys(obj||{});
      var n=nLo+Math.floor(rng()*((nHi-nLo)+1));
      n=Math.max(1, Math.min(n, keys.length));
      var arr=keys.slice();
      for(var i=arr.length-1;i>0;i--){
        var j=Math.floor(rng()*(i+1));
        var t=arr[i]; arr[i]=arr[j]; arr[j]=t;
      }
      return arr.slice(0,n);
    }
    var sellBase=C.sellBase||{med:6,alloy:4,leather:3};
    var buyBase=C.buyBase||{food:1,leather:2,crystal:3};
    var sells=[], buys=[];
    pickKeys(sellBase).forEach(function(k){
      sells.push({ key:k, n:nStock(0), price:jPrice(sellBase[k]) });
    });
    pickKeys(buyBase).forEach(function(k){
      buys.push({ key:k, n:nStock(extra), price:jPrice(buyBase[k]) });
    });
    return { sells:sells, buys:buys };
  }
  /* 成交一件. kind='buy'(玩家买入,扣矿) | 'sell'(玩家卖出,得矿)
     socialMul: 社交议价系数(买更便宜, 卖更值钱)。仓不够用地上堆(先仓后堆)。
     alloy=合金按 storeN 折矿; crystal=地上 it_crystal_ore。 */
  function creditGood(meta, entities, key, n){
    n=n||1;
    if(key==='alloy'){
      var mul=((CFG.items&&CFG.items.it_alloy&&CFG.items.it_alloy.storeN)||3);
      meta.res.mineral=(meta.res.mineral||0)+mul*n;
      return;
    }
    if(key==='crystal'){
      if(window.APH.Combat && APH.Combat.spawnDrop)
        APH.Combat.spawnDrop(CFG.HAB.x, CFG.HAB.y+36, 'it_crystal_ore', n, {stock:true, jitter:10});
      return;
    }
    meta.res[key]=(meta.res[key]||0)+n;
  }
  function debitGood(meta, entities, key, n){
    n=n||1;
    var Col=APH.Colony;
    if(key==='crystal'){
      if(!Col.takeDropped || Col.takeDropped(entities, 'it_crystal_ore', n)<n) return false;
      return true;
    }
    if(key==='alloy'){
      var mul=((CFG.items&&CFG.items.it_alloy&&CFG.items.it_alloy.storeN)||3);
      if(Col.stockOf(meta.res, entities, 'mineral')<mul*n) return false;
      Col.takeStock(meta.res, entities, 'mineral', mul*n);
      return true;
    }
    if(Col.stockOf(meta.res, entities, key)<n) return false;
    Col.takeStock(meta.res, entities, key, n);
    return true;
  }
  function tradeOnce(meta, entities, stock, kind, idx, socialMul){
    var Col=APH.Colony;
    meta=meta||{}; meta.res=meta.res||{};
    var mul=socialMul||0;
    if(kind==='buy'){
      var it=((stock&&stock.sells)||[])[idx];
      if(!it || (it.n||0)<=0) return { ok:false, why:'没货了' };
      var cost=Math.max(1, Math.round(it.price*(1-mul)));
      if(Col.stockOf(meta.res, entities, 'mineral') < cost)
        return { ok:false, why:'矿材不足(需'+cost+')' };
      Col.takeStock(meta.res, entities, 'mineral', cost);
      it.n--;
      creditGood(meta, entities, it.key, 1);
      return { ok:true, kind:'buy', key:it.key, cost:cost };
    }
    if(kind==='sell'){
      var of=((stock&&stock.buys)||[])[idx];
      if(!of || (of.n||0)<=0) return { ok:false, why:'不再收购' };
      if(!debitGood(meta, entities, of.key, 1))
        return { ok:false, why:'没有存货可卖' };
      of.n--;
      var gain=Math.max(1, Math.round(of.price*(1+mul)));
      meta.res.mineral=(meta.res.mineral||0)+gain;
      return { ok:true, kind:'sell', key:of.key, gain:gain };
    }
    return { ok:false, why:'未知操作' };
  }

  /* 直线走向目标(无寻路): 到达后停下. 坐标不落盘 */
  function walkToward(e, target, dt, speed){
    if(!e || !target) return e;
    var C=CFG.walk||{};
    var spd=speed!=null?speed:(C.speed!=null?C.speed:56);
    var arrive=C.arriveR!=null?C.arriveR:3;
    var dx=target.x-e.x, dy=target.y-e.y;
    var d=Math.sqrt(dx*dx+dy*dy);
    if(!(d>arrive)){
      e.x=target.x; e.y=target.y; e.walking=false;
      return e;
    }
    var step=spd*(dt||0);
    if(step>=d){
      e.x=target.x; e.y=target.y; e.walking=false;
      return e;
    }
    e.x+=dx/d*step; e.y+=dy/d*step;
    e.walking=true;
    e.face=Math.atan2(dy, dx);
    return e;
  }

  /* 过客在家园院子里闲逛(无寻路): 到边界折返 */
  function wanderStep(e, dt, hab, yardR, rng){
    var rand = rng || Math.random;
    var H = hab || CFG.HAB;
    var R = yardR || ((CFG.visitor && CFG.visitor.yardR) || 220);
    var spd = (CFG.visitor && CFG.visitor.speed) || 48;
    e.wanderT = (e.wanderT||0) - dt;
    if(e.wanderT <= 0){
      e.wanderA = rand() * Math.PI * 2;
      e.wanderT = 1.4 + rand() * 3.2;
    }
    e.x += Math.cos(e.wanderA||0) * spd * dt;
    e.y += Math.sin(e.wanderA||0) * spd * dt;
    var dx = e.x - H.x, dy = e.y - H.y;
    var d = Math.sqrt(dx*dx + dy*dy) || 1;
    if(d > R){
      e.x = H.x + dx / d * R;
      e.y = H.y + dy / d * R;
      e.wanderA = Math.atan2(-dy, -dx) + (rand() - 0.5);
    }
    e.x = U.clamp(e.x, 40, CFG.WORLD - 40);
    e.y = U.clamp(e.y, 40, CFG.WORLD - 40);
    return e;
  }

  /* ---------- V2 程序化小传(降级用, 纯函数) ---------- */
  var BIO_A=['沉默寡言','爱管闲事','手艺精湛','记性极差','运气出奇','胆小如鼠','天生乐观','固执己见'];
  var BIO_B=['曾在废墟里救过人','会修任何漏水的管子','坚持每天写日记','养着一株不肯开花的植物',
             '声称听过星球的声音','输掉过一整艘飞船','做的汤全殖民地公认第一','总在夜里看星星'];
  function fallbackBio(r){
    var rng=U.makeRng((r.id.length*131+r.name.length*17)>>>0);
    function pick(a){ return a[Math.floor(rng()*a.length)]; }
    var sk=SKILL_NAMES[r.mainSkill];
    return r.name+'，来自'+r.origin+'，'+pick(BIO_A)+'。'+pick(BIO_B)+
           '。'+sk+'是他/她在船上唯一安放得下的骄傲。';
  }
  /* LLM 富化(异步): 走 llm.generate 缓存与配额, 失败静默保留程序版 */
  function enrichBio(r){
    if(!APH.LLM || !APH.LLM.enabled()) { r.bio=fallbackBio(r); return Promise.resolve(r); }
    var user='为殖民者写一条中文小传(40-70字)。姓名:'+r.name+'; 出身:'+r.origin+
      '; 性格:'+r.trait+'; 主技能:'+SKILL_NAMES[r.mainSkill]+'('+((r.skills[r.mainSkill]||0))+'级)'+
      '; 当前心情:'+r.mood+'。只输出JSON: {"bio":"..."}。冷静克制的科幻笔触。';
    return APH.LLM.generate('colonist_v1', {id:r.id}, '你是科幻游戏的程序化叙事引擎, 只输出合法 JSON。', user)
      .then(function(en){
        r.bio = (en && typeof en.bio==='string' && en.bio.length>=10)
          ? en.bio.slice(0,140) : fallbackBio(r);
        return r;
      })
      .catch(function(){ r.bio=fallbackBio(r); return r; });
  }

  return {
    SKILLS:SKILLS, SKILL_NAMES:SKILL_NAMES,
    generate:generate, needsTick:needsTick, eatOnce:eatOnce, efficiency:efficiency, clinicTick:clinicTick,
    hurtResident:hurtResident, applyMed:applyMed,
    /* F 健康分型 */
    AILMENT_NAMES:AILMENT_NAMES,
    ensureAilments:ensureAilments, syncIllness:syncIllness,
    addAilment:addAilment, treatAilment:treatAilment, ailmentAge:ailmentAge,
    BREAK_NAMES:BREAK_NAMES, breakTypeOf:breakTypeOf, breakTick:breakTick,
    isBroken:isBroken, lowestBondMate:lowestBondMate,
    canRecruit:canRecruit, recruitInto:recruitInto, wanderStep:wanderStep, walkToward:walkToward,
    joinIntentOf:joinIntentOf, joinChance:joinChance, attemptRecruit:attemptRecruit,
    chanceLabel:chanceLabel, recruitGate:recruitGate,
    hospitalityRate:hospitalityRate, tickImpression:tickImpression, offerMeal:offerMeal,
    socialTick:socialTick, applyBond:applyBond,
    makeTraderStock:makeTraderStock, tradeOnce:tradeOnce, defaultPrio:defaultPrio,
    globalBonuses:globalBonuses,
    fallbackBio:fallbackBio, enrichBio:enrichBio,
  };
})();
