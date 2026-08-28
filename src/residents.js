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
      illness:0,                                             // 病情 0~100, 0=健康
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
    var illMax=C.illnessMax!=null?C.illnessMax:100;
    if(r.food<sickAt) r.illness=clampNeed(Math.round(r.illness+sickAdd), 0, illMax);
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
    var sickF=1;
    if(ill>at) sickF=Math.max(floor, 1-(ill-at)/100);
    return Math.round(moodF*foodF*sickF*100)/100;
  }

  /* 医疗舱治疗(纯函数): 有舱基疗, 有医更快; 无舱且吃饱微愈; 否则少量 ambient 得病 */
  function clinicTick(r, ctx){
    ctx = ctx||{};
    var C=RS();
    var illMax=C.illnessMax!=null?C.illnessMax:100;
    r.illness = r.illness||0;
    var heal=0;
    if(ctx.hasClinic){
      heal = C.clinicHeal!=null?C.clinicHeal:6;
      var sk=ctx.medicSkill||0;
      if(sk>0)       heal += (C.medicHealPerLv!=null?C.medicHealPerLv:1.2)*sk;
      r.illness = clampNeed(Math.round(r.illness-heal), 0, illMax);
      return r;
    }
    var well=C.selfHealFood!=null?C.selfHealFood:65;
    if((r.food||0)>=well){
      var self=C.selfHeal!=null?C.selfHeal:1;
      r.illness = clampNeed(Math.round(r.illness-self), 0, illMax);
      return r;
    }
    var rng = ctx.rng || Math.random;
    var chance=C.ambientSickChance!=null?C.ambientSickChance:0.08;
    var add=C.ambientSick!=null?C.ambientSick:2;
    if(rng()<chance) r.illness=clampNeed(Math.round(r.illness+add), 0, illMax);
    return r;
  }

  /* 袭击打伤(纯函数): 涨病、掉心情, 不致死 */
  function hurtResident(r, amount){
    if(!r) return r;
    var C=RS();
    var illMax=C.illnessMax!=null?C.illnessMax:100;
    var wound=amount!=null?amount:(C.raidWound!=null?C.raidWound:18);
    var moodHit=C.raidMood!=null?C.raidMood:12;
    r.illness=clampNeed(Math.round((r.illness||0)+wound), 0, illMax);
    r.mood=Math.max(0, (r.mood||0)-moodHit);
    return r;
  }

  /* 用药(纯函数): 医疗舱给最重病号额外治一截, 不致死也不变远征 */
  function applyMed(r){
    if(!r) return r;
    var C=RS();
    var illMax=C.illnessMax!=null?C.illnessMax:100;
    var bonus=C.medHeal!=null?C.medHeal:8;
    r.illness=clampNeed(Math.round((r.illness||0)-bonus), 0, illMax);
    return r;
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
    return {
      buildCostMul: Math.max(.4, 1 - best.sk_build*0.12),
      lorePerTick : best.sk_lore*0.5,
      moodBoost   : Math.min(2, best.sk_social*0.3),
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
    canRecruit:canRecruit, recruitInto:recruitInto, wanderStep:wanderStep, walkToward:walkToward,
    joinIntentOf:joinIntentOf, joinChance:joinChance, attemptRecruit:attemptRecruit,
    chanceLabel:chanceLabel, recruitGate:recruitGate,
    hospitalityRate:hospitalityRate, tickImpression:tickImpression, offerMeal:offerMeal,
    socialTick:socialTick, applyBond:applyBond,
    globalBonuses:globalBonuses,
    fallbackBio:fallbackBio, enrichBio:enrichBio,
  };
})();
