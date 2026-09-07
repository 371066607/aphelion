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

  var SCHED_KINDS = ['work', 'joy', 'sleep', 'any'];
  function defaultSchedule(){
    var out=[], h;
    for(h=0;h<24;h++){
      if(h>=12 && h<=23) out.push('sleep');
      else if(h===11) out.push('joy');
      else out.push('work');
    }
    return out;
  }
  function ensureSchedule(sch){
    if(!sch || !sch.length) return defaultSchedule();
    var out=[], i, v;
    for(i=0;i<24;i++){
      v = sch[i];
      out.push(SCHED_KINDS.indexOf(v)>=0 ? v : (defaultSchedule()[i]));
    }
    return out;
  }
  function hourOfDay(clock, dayLen){
    dayLen = dayLen != null ? dayLen : (CFG.DAY_LEN || 3600);
    var t = ((clock % dayLen) + dayLen) % dayLen;
    return Math.floor(t / dayLen * 24) % 24;
  }
  var BODY_PARTS = ['head','torso','armL','armR','legL','legR'];
  function ensureParts(r){
    if(!r) return r;
    r.parts = r.parts || {};
    BODY_PARTS.forEach(function(p){ if(r.parts[p] == null) r.parts[p] = 1; });
    return r;
  }
  function hurtPart(r, part, dmg){
    ensureParts(r);
    if(!r.parts[part]) r.parts[part] = 1;
    r.parts[part] = Math.max(0, r.parts[part] - (dmg || 0));
    return r;
  }
  function partsMoveMul(r){
    if(!r || !r.parts) return 1;
    var a = r.parts.legL != null ? r.parts.legL : 1;
    var b = r.parts.legR != null ? r.parts.legR : 1;
    return Math.max(0.2, Math.min(a, b));
  }
  function makeCorpse(r, x, y){
    return {
      id: 'cr_' + ((r && r.id) || 'unk'),
      type: (CFG.entType && CFG.entType.CORPSE) || 'corpse',
      name: (r && r.name) || '无名',
      rid: r && r.id,
      x: x || 0, y: y || 0,
      dead: false
    };
  }
  function capturePrisoner(meta, enemy){
    if(!meta || !enemy) return null;
    meta.prisoners = meta.prisoners || [];
    var p = { id: enemy.id || ('rv_cap_' + meta.prisoners.length), name: enemy.name || '俘虏', x: enemy.x, y: enemy.y };
    meta.prisoners.push(p);
    enemy.dead = true;
    enemy.prisoner = true;
    return p;
  }
  function releasePrisoner(meta, id){
    if(!meta) return false;
    var n = (meta.prisoners || []).length;
    meta.prisoners = (meta.prisoners || []).filter(function(p){ return p.id !== id; });
    return meta.prisoners.length < n;
  }
  function buryCorpse(c){
    if(c) c.dead = true;
    return c;
  }
  function collectThoughts(pawn, ctx){
    pawn = pawn || {};
    ctx = ctx || {};
    var cat = CFG.thoughts || {};
    var out = [];
    function add(id){
      var d = cat[id];
      if(!d) return;
      out.push({ id:id, text:d.text, mood:d.mood });
    }
    /* 幅度可变的念头: 沿用目录里的文案, 但心情值由上下文算出
       (房间家具档次、关系恶劣程度 —— 环世界的 opinion 类念头同理)。 */
    function addVar(id, mood){
      var d = cat[id];
      if(!d || !mood) return;
      out.push({ id:id, text:d.text, mood:mood });
    }
    var food = pawn.food;
    if(food != null){
      if(food < 30) add('th_starving');
      else if(food < 60) add('th_hungry');
      else if(food > 80) add('th_well_fed');
    }
    if(ctx.ateRaw) add('th_ate_raw');
    if(ctx.ateCooked) add('th_ate_meal');
    if(ctx.ateTable) add('th_ate_table');
    if(pawn.isSleeping){
      if(pawn.bedId) add('th_slept_bed');
      else add('th_floor_sleep');
    }
    if(pawn.rest != null){
      if(pawn.rest < 20) add('th_tired');
      else if(pawn.rest > 85 && !pawn.isSleeping) add('th_rested');
    }
    var rec = pawn.recreation;
    if(rec != null){
      if(rec < 30) add('th_bored');
      else if(rec > 70) add('th_joy');
    }
    if(ctx.atJoy) add('th_campfire');
    /* 房间美观念头统一在下面处理(见 roomPretty/roomMood), 此处不再单独挂,
       否则「漂亮」档会用目录里的固定值, 反而比下一档的可变加成还低。 */
    var TC = CFG.thoughtCtx || {};
    if(ctx.temp != null){
      var coldT = TC.coldT!=null?TC.coldT:5, hotT = TC.hotT!=null?TC.hotT:32;
      if(ctx.temp < coldT) add('th_cold');
      else if(ctx.temp > hotT) add('th_hot');
    }
    if((pawn.illness || 0) > 40) add('th_sick');
    if(pawn.downed) add('th_downed');
    if(ctx.raid) add('th_raid');
    else if(!pawn.downed) add('th_safe');
    if(ctx.exposed) add('th_exposed');
    if(ctx.night && !ctx.sheltered) add('th_dark');
    if(ctx.lonely) add('th_lonely');
    if(ctx.socialRecent) add('th_social');
    if((ctx.filth || 0) > 20) add('th_filthy');
    if(ctx.corpseNearby) add('th_saw_corpse');
    if(ctx.fireNearby) add('th_fire');
    /* P2 美观: 一个房间只挂一条念头, 幅度一律取美观分算出的 roomMood。
       「漂亮」档换专属文案但沿用同一幅度 —— 曾因用目录固定值(+3)
       导致「装修得更好反而心情更差」(下一档可变加成已经 +4)。 */
    if(ctx.roomPretty){
      var prettyMood = ctx.roomMood;
      if(!prettyMood){
        var pd = cat.th_pretty_room;
        prettyMood = pd ? pd.mood : 0;
      }
      addVar('th_pretty_room', prettyMood);
    } else if(ctx.roomMood){
      addVar(ctx.roomMood>0?'th_room':'th_room_bad', ctx.roomMood);
    }
    if(ctx.roomFriction) addVar('th_roommate', ctx.roomFriction);
    if(pawn.parts){
      var hurt=false;
      Object.keys(pawn.parts).forEach(function(p){ if(pawn.parts[p] < 0.7) hurt=true; });
      if(hurt) add('th_hurt');
    }
    return out;
  }
  function thoughtMoodSum(list){
    var n=0, i;
    for(i=0;i<(list||[]).length;i++) n += (list[i].mood || 0);
    return n;
  }

  /* ADR-31 念头驱动心情。
     心情 = 中性基线 + 当前念头偏移之和, 每跳缓动逼近, 不再各处零散加减。
     顺带把这一跳的念头清单挂到 r.thoughts —— 检查器直接渲染它,
     保证「面板上看到的理由」与「真正驱动模拟的数字」永远同源。 */
  function moodFromThoughts(r, ctx){
    if(!r) return 0;
    var C=RS();
    var base = C.moodBase!=null?C.moodBase:70;
    var cap  = C.moodCap!=null?C.moodCap:95;
    var floor= C.moodFloor!=null?C.moodFloor:0;
    var lerp = C.moodLerp!=null?C.moodLerp:0.34;
    var list = collectThoughts(r, ctx||{});
    var target = base + thoughtMoodSum(list);
    if(target>cap) target=cap;
    if(target<floor) target=floor;
    var cur = r.mood!=null ? r.mood : base;
    r.mood = cur + (target-cur)*lerp;
    if(r.mood>cap) r.mood=cap;
    if(r.mood<floor) r.mood=floor;
    r.thoughts = list;
    r.moodTarget = target;
    return r.mood;
  }
  function cycleScheduleSlot(kind){
    var i = SCHED_KINDS.indexOf(kind);
    if(i<0) i=0;
    return SCHED_KINDS[(i+1)%SCHED_KINDS.length];
  }
  function scheduleAt(sch, hour){
    sch = ensureSchedule(sch);
    hour = ((hour % 24) + 24) % 24;
    return sch[hour] || 'any';
  }

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
      rest:100,                                              // 深度生存: 精力 (Survival #15)
      isSleeping:false,                                      // 是否处于睡眠中
      bedId:null,                                            // 绑定的床位 ID (null 为打地铺)
      sleepDisturbed:0,                                      // 惊醒剩余跳数
      recreation:80,                                         // 深度生存: 娱乐值 (Survival #18)
      exposure:0,                                            // 深度生存: 气候暴露值 (Survival #19)
      downed:false,                                          // 深度生存: 击倒状态 (Survival #17)
      bleedOutTimer:null,                                    // 濒死失血倒计时 (s)
      rescuedBy:null,                                        // 救援人 ID
      job:null,                                              // 指派岗位 bl_xxx|null
      parts:{ head:1, torso:1, armL:1, armR:1, legL:1, legR:1 },
      schedule: defaultSchedule(),
      trait:pick(['勤恳','话痨','独行','乐观','谨慎','暴脾气']),
      arrivedAt:0,
    };
  }

  function RS(){ return (CFG.residents)||{}; }

  /* ---------- T8 餐桌椅座位分配 (issue #81, 纯函数) ----------
     输入: hungry=饥饿居民[{id,x,y}], chairs=[{id,x,y}], tables=[{x,y}]
     规则:
       - 每椅 1 人 (先到先得, 按距居民近优先)
       - 椅子必须在某张桌子 chairTableR 内才算可用餐位 (独椅无桌不算)
       - 就近分配: 每轮取「居民→椅」距离最小的一对
     输出: { 由rid到 {chair, table} 的映射 }
     返回是否全员有座无关——调用方对无座者退化为旧的无桌吃。 */
  function diningSeatAlloc(hungry, chairs, tables){
    var C=RS();
    var chairR=C.diningChairR!=null?C.diningChairR:90;
    var tableR=C.chairTableR!=null?C.chairTableR:60;
    if(!hungry || !hungry.length || !chairs || !chairs.length || !tables || !tables.length){
      return {};
    }
    /* 有效的椅子: 至少靠近一张桌子 + 距至少一名饥饿居民 ≤ chairR */
    var usable=[];
    chairs.forEach(function(ch){
      var near=null;
      for(var i=0;i<tables.length;i++){
        var d=Math.sqrt(Math.pow(ch.x-tables[i].x,2)+Math.pow(ch.y-tables[i].y,2));
        if(d<=tableR){ near=tables[i]; break; }
      }
      if(!near) return;
      var reachable=false;
      for(var k=0;k<hungry.length;k++){
        var dh=Math.sqrt(Math.pow(ch.x-hungry[k].x,2)+Math.pow(ch.y-hungry[k].y,2));
        if(dh<=chairR){ reachable=true; break; }
      }
      if(reachable){ usable.push({ chair:ch, table:near }); }
    });
    if(!usable.length) return {};
    var out={};
    /* 贪心: 反复取全局最近 (居民↔可用椅) 对 */
    var left=hungry.slice();
    while(left.length && usable.length){
      var bi=-1, bj=-1, bd=Infinity;
      for(var i=0;i<left.length;i++){
        for(var j=0;j<usable.length;j++){
          var d=Math.sqrt(Math.pow(left[i].x-usable[j].chair.x,2)+Math.pow(left[i].y-usable[j].chair.y,2));
          if(d<bd){ bd=d; bi=i; bj=j; }
        }
      }
      if(bi<0) break;
      var r=left.splice(bi,1)[0];
      var u=usable.splice(bj,1)[0];
      out[r.id]={ chair:u.chair, table:u.table, dist:bd };
    }
    return out;
  }

  /* T8: 面向桌角度 (椅子处看桌子) */
  function faceTable(chair, table){
    if(!chair || !table) return 0;
    return Math.atan2(table.y-chair.y, table.x-chair.x);
  }
  function clampNeed(v, lo, hi){
    return Math.max(lo, Math.min(hi, v));
  }

  /* 玩家家园饱食: 只在 home 掉; 远征冻结; 钳到 0, 不饿死 */
  function homeFoodTick(food, scene){
    var start = (CFG.player && CFG.player.homeFoodStart != null) ? CFG.player.homeFoodStart : 80;
    var v = food == null ? start : food;
    if(scene !== 'home') return clampNeed(v, 0, 100);
    var drain = RS().foodDrain != null ? RS().foodDrain : 6;
    return clampNeed(v - drain, 0, 100);
  }
  /* 玩家家园精力: 只在 home 掉; 远征冻结; 钳到 0 (累塌另票) */
  function homeRestTick(rest, scene){
    var start = (CFG.player && CFG.player.homeRestStart != null) ? CFG.player.homeRestStart : 100;
    var v = rest == null ? start : rest;
    if(scene !== 'home') return clampNeed(v, 0, 100);
    var drain = RS().restDrain != null ? RS().restDrain : 7;
    return clampNeed(v - drain, 0, 100);
  }
  /* 玩家家园病情: 本票只钳 0..100; 家园/远征都不改值 (远征冻结可测; 涨病另票) */
  function homeIllnessTick(ill, scene){
    var start = (CFG.player && CFG.player.homeIllnessStart != null) ? CFG.player.homeIllnessStart : 0;
    var v = ill == null ? start : ill;
    return clampNeed(v, 0, 100);
  }
  function ensurePlayerNeeds(meta){
    meta = meta || {};
    meta.playerNeeds = meta.playerNeeds || {};
    var foodStart = (CFG.player && CFG.player.homeFoodStart != null) ? CFG.player.homeFoodStart : 80;
    var restStart = (CFG.player && CFG.player.homeRestStart != null) ? CFG.player.homeRestStart : 100;
    var illStart = (CFG.player && CFG.player.homeIllnessStart != null) ? CFG.player.homeIllnessStart : 0;
    if(meta.playerNeeds.food == null) meta.playerNeeds.food = foodStart;
    if(meta.playerNeeds.rest == null) meta.playerNeeds.rest = restStart;
    if(meta.playerNeeds.illness == null) meta.playerNeeds.illness = illStart;
    /* #66 床边睡眠: 单点默认(覆盖新档 + 老档加载两条路径) */
    if(meta.playerNeeds.isSleeping == null) meta.playerNeeds.isSleeping = false;
    /* #72 家园击倒: 默认不击倒; downT 倒计时空(老档保护, 不秒死) */
    if(meta.playerNeeds.downed == null) meta.playerNeeds.downed = false;
    if(meta.playerNeeds.downT == null) meta.playerNeeds.downT = null;
    /* W3 天气装备: 玩家 gear 挂载点(与居民同结构; 寒潮防寒服/酸雨防酸服减免读取处) */
    if(meta.playerNeeds.gear == null) meta.playerNeeds.gear = { tool:null, suit:null, head:null };
    /* P1b 玩家暴露: 老档零迁移 (缺失=0 起步; 晴天恒 0 由 tick 消退维持) */
    if(meta.playerNeeds.exposure == null) meta.playerNeeds.exposure = 0;
    if(meta.playerNeeds.recreation == null) meta.playerNeeds.recreation = 80;
    /* 殖民地优先 T1: 指挥官是居民之一, 所以他也有心情, 也由念头驱动(ADR-31)。
       老档缺失 → 从中性基线起步, 零迁移。 */
    if(meta.playerNeeds.mood == null){
      var C0 = RS();
      meta.playerNeeds.mood = (C0.moodBase != null) ? C0.moodBase : 70;
    }
    meta.playerSchedule = ensureSchedule(meta.playerSchedule);
    return meta;
  }

  /* ---------- #66 玩家床边睡眠/唤醒 (纯函数, #67 累塌/#70 医疗舱可复用) ---------- */
  /* 入睡: 置 isSleeping; 有床时绑定床ID(无则打地铺); 返回 needs。 */
  function setPlayerSleeping(needs, flag, hasBed, bedIdParam){
    if(!needs) return needs;
    needs.isSleeping = !!flag;
    if(needs.isSleeping && hasBed){
      needs.bedId = bedIdParam || needs.bedId || 'bed_player';   // #70 医疗舱可传床ID; 默认保留 'bed_player'
    }else{
      needs.bedId = null;
    }
    return needs;
  }
  /* 唤醒(通用, 无心情惩罚): 清睡眠+床位, 返回是否真的在睡。 */
  function playerWake(needs){
    if(!needs || !needs.isSleeping) return false;
    needs.isSleeping = false;
    needs.bedId = null;
    return true;
  }
  /* 玩家精力结算(纯函数): 睡眠中按床/地铺恢复, 回满自动醒;
     清醒时委托 homeRestTick(家园掉7, 远征冻结)。 */
  function playerRestTick(needs, scene, hasBed){
    if(!needs) return null;
    var start = (CFG.player && CFG.player.homeRestStart != null) ? CFG.player.homeRestStart : 100;
    var v = needs.rest == null ? start : needs.rest;
    var C = RS();
    if(needs.isSleeping){
      var bedRec  = (CFG.player && CFG.player.bedRecover != null) ? CFG.player.bedRecover : (C.bedRecover!=null?C.bedRecover:25);
      var flRec   = (CFG.player && CFG.player.floorRecover != null) ? CFG.player.floorRecover : (C.floorRecover!=null?C.floorRecover:18);
      var wakeAt  = (CFG.player && CFG.player.restWakeAt != null) ? CFG.player.restWakeAt : (C.restWakeAt!=null?C.restWakeAt:100);
      needs.rest = clampNeed(v + (hasBed ? bedRec : flRec), 0, 100);
      if(needs.rest >= wakeAt){
        needs.isSleeping = false;
        needs.bedId = null;                        // #67 对齐 playerWake: 自动醒也清床位
      }
    }else{
      needs.rest = homeRestTick(v, scene);
      /* #67 累塌: 家园精力见底(<=0)原地强制睡着(打地铺, bedId=null)。
         只在家园触发: 远征精力冻结(不会见底), scene 门保证老档/调试的 0 值远征不误塌。 */
      var collapseAt = (CFG.player && CFG.player.restCollapseAt != null) ? CFG.player.restCollapseAt : 0;
      if(scene === 'home' && needs.rest <= collapseAt){
        setPlayerSleeping(needs, true, false);     // 原地地铺睡; bedId=null; 唤醒规则继承 #66
      }
    }
    return needs;
  }

  /* 玩家家园击倒结算(纯函数): 击倒=家园专属, 远征 no-op(老档保护)。
     有居民且已被拖进医疗舱 → 复活(清 downed/downT, 返回 revived);
     否则倒计时递减, 归零 → 死亡(清 downed/downT, 返回 dead)。
     不进死亡画面、不动 clinicKit/stats.deaths (由调用方 updateHome 收口)。 */
  function playerDownedTick(needs, scene, dt, ctx){
    if(scene !== 'home') return { dead:false, revived:false };   // 远征 no-op + 老档保护
    if(!needs || !needs.downed) return { dead:false, revived:false };
    ctx = ctx || {};
    if(ctx.inClinic && ctx.hasClinic && ctx.hasResidents){
      needs.downed = false;
      needs.downT = null;
      return { dead:false, revived:true };
    }
    var maxT = (CFG.player && CFG.player.downedTime != null) ? CFG.player.downedTime : 90;
    needs.downT = (needs.downT != null ? needs.downT : maxT) - (dt||0);
    if(needs.downT <= 0){
      needs.downed = false;
      needs.downT = null;
      return { dead:true, revived:false };
    }
    return { dead:false, revived:false };
  }

  /* ---------- U4: 饱食/心情/病情 tick(纯函数) ----------
     每30游戏秒一跳: 掉饱食; 真吃饭在走位里(仓/地上堆). 饿→心情掉且涨病; 不饿死.
     深度生存: 结算精力消耗与睡眠恢复。 */
  function needsTick(r, hasFood, ctx){
    var C=RS();
    var out={ ate:false };
    ctx = ctx || {};
    r.illness = r.illness||0;
    r.rest = r.rest!=null ? r.rest : 100;
    r.isSleeping = !!r.isSleeping;
    r.sleepDisturbed = r.sleepDisturbed||0;

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
    /* ADR-31: 饱食/病情/床铺/娱乐的心情影响全部改由念头表达, 见本函数末尾的
       moodFromThoughts —— 此处只保留需求数值本身的结算。 */

    /* 深度生存: 精力自然衰减与睡眠恢复 (Survival #15) */
    var restDrain=C.restDrain!=null?C.restDrain:7;
    var restSleepAt=C.restSleepAt!=null?C.restSleepAt:20;
    var restWakeAt=C.restWakeAt!=null?C.restWakeAt:100;
    var bedRec=C.bedRecover!=null?C.bedRecover:25;
    var floorRec=C.floorRecover!=null?C.floorRecover:18;

    /* 环世界: 困了 (rest < restSleepAt) 只标记 wantSleep，由走位去床再躺下。
       精力归零才原地累塌。needsTick 不再把人就地瞬睡。 */
    if(r.isSleeping){
      var rec = r.bedId ? bedRec : floorRec;
      r.rest = Math.min(100, r.rest + rec);
      if(r.rest >= restWakeAt){
        r.isSleeping = false;
        r.wantSleep = false;
      }
    }else{
      r.rest = Math.max(0, r.rest - restDrain);
      var night = false;
      if(window.APH.World && APH.World.daylight) night = APH.World.daylight() < 0.5;
      var nightAt = C.restNightAt != null ? C.restNightAt : 75;
      r.wantSleep = r.rest < restSleepAt || (night && r.rest < nightAt);
      if(r.rest <= 0){
        r.isSleeping = true;
        r.wantSleep = true;
      }
    }

    /* #69 病重躺舱: 病情回落到阈值以下且未击倒 → 起身 (独立于 isSleeping, 与睡醒互不干扰)
       (lag: 生产跳内 needsTick 先于运动分支, 起身至多晚 1 跳) */
    var bedAt = C.sickBedAt!=null ? C.sickBedAt : 50;
    if(r.medLying && !r.downed && (r.illness||0) <= bedAt) r.medLying = false;

    /* ADR-31: 床铺/地铺心情 → th_slept_bed / th_floor_sleep */

    /* 深度生存: 娱乐需求自然衰减与身心愉悦/枯燥心情 (Survival #18) */
    var recDrain = C.recreationDrain!=null ? C.recreationDrain : 5;
    var recBuffAt = C.recreationBuffAt!=null ? C.recreationBuffAt : 80;
    var recBuffMood = C.recreationBuffMood!=null ? C.recreationBuffMood : 8;
    var recBoredAt = C.recreationBoredAt!=null ? C.recreationBoredAt : 20;
    var recBoredMood = C.recreationBoredMood!=null ? C.recreationBoredMood : -5;

    r.recreation = r.recreation!=null ? r.recreation : 80;
    r.recreation = Math.max(0, r.recreation - recDrain);
    /* ADR-31: 娱乐心情 → th_joy / th_bored */

    if(r.sleepDisturbed > 0) r.sleepDisturbed--;
    moodFromThoughts(r, ctx);
    return out;
  }

  /* 走到粮堆/仓库后吃一口. 生产跳只掉饱食, 不隔空扣地上. */
  function eatOnce(r, itemDef){
    var C=RS();
    var below=C.eatBelow!=null?C.eatBelow:60;
    var gain=C.eatGain!=null?C.eatGain:25;
    if(!r || r.food==null || r.food>=below) return false;
    var def = (typeof itemDef === 'string' && CFG.items) ? CFG.items[itemDef] : itemDef;
    var fGain = (def && def.foodGain != null) ? def.foodGain : gain;
    var mGain = (def && def.moodGain != null) ? def.moodGain : 0;
    var rGain = (def && def.recGain != null) ? def.recGain : 0;
    var wBonus = (def && def.warmBonus != null) ? def.warmBonus : 0;

    r.food = Math.min(100, (r.food||0) + fGain);
    if(mGain > 0){
      var cap = C.moodCap != null ? C.moodCap : 95;
      r.mood = Math.min(cap, (r.mood || 70) + mGain);
    }
    if(rGain > 0){
      r.recreation = Math.min(100, (r.recreation != null ? r.recreation : 80) + rGain);
    }
    if(wBonus > 0 && r.exposure != null){
      r.exposure = Math.max(0, r.exposure - wBonus);
    }
    return true;
  }

  /* 享用菜肴纯函数(返回详尽身心增益与数值结算) (Cooking #49)
     opts.atTable (T8 #81): 在餐桌用餐 → 额外 diningMoodGain 心情 (无桌吃见 noTableMoodPenalty) */
  function eatMeal(r, itemDef, opts){
    var C=RS();
    var below=C.eatBelow!=null?C.eatBelow:60;
    var gain=C.eatGain!=null?C.eatGain:25;
    if(!r || r.food==null || r.food>=below) return { ate:false };
    var def = (typeof itemDef === 'string' && CFG.items) ? CFG.items[itemDef] : itemDef;
    var fGain = (def && def.foodGain != null) ? def.foodGain : gain;
    var mGain = (def && def.moodGain != null) ? def.moodGain : 0;
    var rGain = (def && def.recGain != null) ? def.recGain : 0;
    var wBonus = (def && def.warmBonus != null) ? def.warmBonus : 0;
    var cap = C.moodCap != null ? C.moodCap : 95;

    r.food = Math.min(100, (r.food||0) + fGain);
    if(mGain > 0){
      r.mood = Math.min(cap, (r.mood || 70) + mGain);
    }
    if(opts && opts.atTable){
      var tGain = C.diningMoodGain != null ? C.diningMoodGain : 4;
      r.mood = Math.min(cap, (r.mood || 70) + tGain);
    }
    if(rGain > 0){
      r.recreation = Math.min(100, (r.recreation != null ? r.recreation : 80) + rGain);
    }
    if(wBonus > 0 && r.exposure != null){
      r.exposure = Math.max(0, r.exposure - wBonus);
    }
    return {
      ate: true,
      foodGain: fGain,
      moodGain: mGain + (opts && opts.atTable ? (C.diningMoodGain != null ? C.diningMoodGain : 4) : 0),
      recGain: rGain,
      warmBonus: wBonus,
      isCooked: !!(def && def.isCooked),
      item: def,
      atTable: !!(opts && opts.atTable)
    };
  }

  /* #65 玩家走到粮边吃: 纯函数只改 playerNeeds.food(玩家需求无 mood/recreation/exposure,
     绝不复用居民 eatOnce 以免污染)。熟食用 itemDef.foodGain, 生食/口粮用 CFG.player.foodEatGain。 */
  function playerEatOnce(needs, itemDef){
    var below=(CFG.player&&CFG.player.foodEatBelow!=null)?CFG.player.foodEatBelow:60;
    var gain=(CFG.player&&CFG.player.foodEatGain!=null)?CFG.player.foodEatGain:25;
    if(!needs || needs.food==null || needs.food>=below) return { ate:false, reason:'full' };
    var def=(typeof itemDef==='string'&&CFG.items)?CFG.items[itemDef]:itemDef;
    var fGain=(def&&def.foodGain!=null)?def.foodGain:gain;
    var before=needs.food;
    needs.food=Math.min(100, needs.food+fGain);
    return { ate:true, gain:needs.food-before };
  }

  /* 工作效率系数: 心情 × 饱食 × 病情(超阈值打折, 有地板) */
  function efficiency(r){
    var C=RS();
    r = r || {};
    var mood = r.mood != null ? r.mood : 80;
    var food = r.food != null ? r.food : 80;
    var moodF=0.55+(mood/100)*0.75;                         // 0.55~1.30
    var foodF=food>=50?1:(0.5+food/100);                  // <50 开始打折
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
  function bondKey(aId, bId){
    if(aId === 'player') return 'player|' + bId;
    if(bId === 'player') return 'player|' + aId;
    return aId < bId ? aId + '|' + bId : bId + '|' + aId;
  }

  function relationshipTierOf(bond){
    var v = (bond != null && !isNaN(bond)) ? bond : 50;
    var tiers = (CFG.social && CFG.social.tiers) || [
      { id:'rival', name:'宿怨', min:0, max:20, icon:'⚡', color:'#ff6b6b' },
      { id:'disliked', name:'不和', min:20, max:40, icon:'😒', color:'#ffa07a' },
      { id:'neutral', name:'平淡', min:40, max:60, icon:'😐', color:'#dcdcdc' },
      { id:'friend', name:'朋友', min:60, max:80, icon:'😊', color:'#8fd4ff' },
      { id:'close_friend', name:'挚友', min:80, max:100.01, icon:'❤️', color:'#ff85c0' },
    ];
    for(var i = 0; i < tiers.length; i++){
      var t = tiers[i];
      if(v >= t.min && v < t.max){
        return t;
      }
    }
    return tiers[tiers.length - 1];
  }

  function keyBondsOf(residentId, allResidents, bonds){
    var b = bonds || {};
    var rList = allResidents || [];
    var closest = null, maxBond = -1;
    var worst = null, minBond = 101;

    for(var i = 0; i < rList.length; i++){
      var other = rList[i];
      if(!other || other.id === residentId) continue;
      var k = bondKey(residentId, other.id);
      var val = (b[k] != null) ? b[k] : 50;
      if(val > maxBond){
        maxBond = val;
        closest = { otherId: other.id, name: other.name, bond: val, tier: relationshipTierOf(val) };
      }
      if(val < minBond){
        minBond = val;
        worst = { otherId: other.id, name: other.name, bond: val, tier: relationshipTierOf(val) };
      }
    }

    var pk = bondKey(residentId, 'player');
    var pVal = (b[pk] != null) ? b[pk] : 50;
    var playerRel = { bond: pVal, tier: relationshipTierOf(pVal) };

    return {
      closest: closest,
      worst: worst,
      player: playerRel
    };
  }

  function workSynergyOf(worker, coworkers, bonds){
    if(!worker || !coworkers || !coworkers.length) return 1.0;
    var list = coworkers.filter(function(c){ return c && c.id !== worker.id; });
    if(!list.length) return 1.0;
    var b = bonds || {};
    var C = (CFG.social) || {};
    var fSyn = C.friendSynergy != null ? C.friendSynergy : 1.15;
    var rPen = C.rivalPenalty != null ? C.rivalPenalty : 0.85;

    var sum = 0;
    for(var i = 0; i < list.length; i++){
      var c = list[i];
      var k = bondKey(worker.id, c.id);
      var val = (b[k] != null) ? b[k] : 50;
      var tier = relationshipTierOf(val);
      if(tier.id === 'friend' || tier.id === 'close_friend'){
        sum += fSyn;
      } else if(tier.id === 'rival' || tier.id === 'disliked'){
        sum += rPen;
      } else {
        sum += 1.0;
      }
    }
    return Math.round((sum / list.length) * 100) / 100;
  }

  function roomFrictionOf(resident, roommates, bonds){
    if(!resident || !roommates || !roommates.length) return 0;
    var list = roommates.filter(function(r){ return r && r.id !== resident.id; });
    if(!list.length) return 0;
    var b = bonds || {};
    var C = (CFG.social) || {};
    var pen = C.roomRivalMoodPenalty != null ? C.roomRivalMoodPenalty : -5;

    for(var i = 0; i < list.length; i++){
      var other = list[i];
      var k = bondKey(resident.id, other.id);
      var val = (b[k] != null) ? b[k] : 50;
      var tier = relationshipTierOf(val);
      if(tier.id === 'rival' || tier.id === 'disliked'){
        return pen;
      }
    }
    return 0;
  }

  function canSocialEncounter(rA, rB, cooldowns, now, opts){
    if(!rA || !rB || rA === rB || rA.id === rB.id) return false;
    var o = opts || {};
    if(o.raidActive) return false;
    if(o.onDuty) return false;
    if(o.dist != null && o.dist < 16) return false;
    if(rA.downed || rB.downed) return false;
    if(rA.isSleeping || rB.isSleeping) return false;
    if(rA.medLying || rB.medLying) return false;
    if(isBroken(rA) || isBroken(rB) || !!rA.breakType || !!rB.breakType) return false;
    var eatBelow = (CFG.residents && CFG.residents.eatBelow != null) ? CFG.residents.eatBelow : 60;
    if((rA.food != null && rA.food < eatBelow) || (rB.food != null && rB.food < eatBelow)) return false;

    var k = bondKey(rA.id, rB.id);
    var C = CFG.social || {};
    var cd = C.encounterCooldown != null ? C.encounterCooldown : 90;
    if(cooldowns && cooldowns[k] != null && (now - cooldowns[k]) < cd){
      return false;
    }
    return true;
  }

  function triggerSocialEncounter(rA, rB, bonds, cooldowns, now, rng){
    var rand = (typeof rng === 'function') ? rng : Math.random;
    var k = bondKey(rA.id, rB.id);
    if(cooldowns) cooldowns[k] = now;

    var cur = (bonds && bonds[k] != null) ? bonds[k] : 50;
    var tier = relationshipTierOf(cur);
    var C = CFG.social || {};
    var dur = C.encounterPauseTime != null ? C.encounterPauseTime : 1.5;

    var delta = 0;
    var bA = '💬', bB = '💬';
    var text = rA.name + ' 和 ' + rB.name + ' 简单寒暄了几句';

    if(tier.id === 'close_friend'){
      delta = 2;
      bA = '❤️'; bB = '❤️';
      text = rA.name + ' 和 ' + rB.name + ' 开心地打了招呼，彼此更亲近了';
    } else if(tier.id === 'friend'){
      if(rand() < 0.8){
        delta = 1.5;
        bA = '😊'; bB = '😊';
        text = rA.name + ' 和 ' + rB.name + ' 聊得很投机';
      } else {
        delta = 0.5;
        bA = '💬'; bB = '💬';
        text = rA.name + ' 和 ' + rB.name + ' 聊了聊天气';
      }
    } else if(tier.id === 'rival'){
      delta = -2;
      bA = '💢'; bB = '💢';
      text = rA.name + ' 和 ' + rB.name + ' 互相瞪了一眼，拌了句嘴';
    } else if(tier.id === 'disliked'){
      if(rand() < 0.7){
        delta = -1;
        bA = '😒'; bB = '😒';
        text = rA.name + ' 和 ' + rB.name + ' 擦肩而过，气氛尴尬';
      } else {
        delta = 0;
        bA = '💬'; bB = '💬';
        text = rA.name + ' 和 ' + rB.name + ' 敷衍地点了点头';
      }
    } else {
      var rVal = rand();
      if(rVal < 0.4){
        delta = 1;
        bA = '😊'; bB = '💬';
        text = rA.name + ' 和 ' + rB.name + ' 闲聊了几句家常';
      } else if(rVal < 0.7){
        delta = 0;
        bA = '💬'; bB = '💬';
        text = rA.name + ' 和 ' + rB.name + ' 简单打了个招呼';
      } else {
        delta = -0.5;
        bA = '❓'; bB = '💬';
        text = rA.name + ' 和 ' + rB.name + ' 吐槽了今天的工作';
      }
    }

    if(bonds){
      applyBond(bonds, rA.id, rB.id, delta);
    }

    return {
      delta: delta,
      bubbleA: bA,
      bubbleB: bB,
      text: text,
      duration: dur
    };
  }

  function attemptIntervention(target, counselor, rng, bonds){
    if(!target || !counselor) return { success:false };
    var rand = (typeof rng === 'function') ? rng : Math.random;
    var C = CFG.social || {};
    var base = C.interventionBaseChance != null ? C.interventionBaseChance : 0.40;
    var sk = (counselor.skills && counselor.skills.sk_social) || 0;
    var skScale = C.interventionSkillScale != null ? C.interventionSkillScale : 0.06;
    var bondScale = C.interventionBondScale != null ? C.interventionBondScale : 0.005;
    var minChance = C.interventionMinChance != null ? C.interventionMinChance : 0.15;
    var maxChance = C.interventionMaxChance != null ? C.interventionMaxChance : 0.90;

    var k = bondKey(target.id, counselor.id);
    var curBond = (bonds && bonds[k] != null) ? bonds[k] : 50;

    var chance = base + sk * skScale + (curBond - 50) * bondScale;
    chance = Math.max(minChance, Math.min(maxChance, chance));

    var success = rand() < chance;
    if(success){
      target.breakType = null;
      target.breakT = 0;
      var moodGain = C.calmComfortMood != null ? C.calmComfortMood : 10;
      target.mood = Math.min(100, (target.mood || 50) + moodGain);
      if(bonds) applyBond(bonds, target.id, counselor.id, 6);
      return {
        success: true,
        chance: chance,
        text: (counselor.name || '安抚者') + ' 成功安抚了 ' + target.name + ' 的情绪'
      };
    } else {
      var isViolent = (target.breakType === 'brawl' || target.breakType === 'tantrum');
      if(isViolent && bonds){
        applyBond(bonds, target.id, counselor.id, -5);
      }
      return {
        success: false,
        chance: chance,
        retaliate: isViolent,
        text: isViolent
          ? target.name + ' 被激怒了，转火攻击了劝解者！'
          : target.name + ' 沉浸在情绪中，劝解无果'
      };
    }
  }

  function hackTerminal(terminal, hacker, rng){
    if(!terminal) return { success:false };
    if(terminal.hacked) return { success:true, alreadyHacked:true };
    var rand = (typeof rng === 'function') ? rng : Math.random;

    var base = 0.45;
    var sk = (hacker && hacker.skills && hacker.skills.sk_lore) || 0;
    var chance = Math.max(0.20, Math.min(0.90, base + sk * 0.08));

    var success = rand() < chance;
    if(success){
      terminal.hacked = true;
      terminal.alarm = false;
      return {
        success: true,
        chance: chance,
        unlocked: true,
        text: '终端破译成功！能量门禁已解除'
      };
    } else {
      terminal.alarm = true;
      return {
        success: false,
        chance: chance,
        alarm: true,
        text: '破译触发安全协议！警报惊醒了守卫！'
      };
    }
  }

  /* 斗殴对象: 好感最低的同事(无记录按 50 算) */
  function lowestBondMate(r, residents, bonds){
    var best=null, bv=1e9;
    (residents||[]).forEach(function(o){
      if(!o || o===r || o.id===r.id) return;
      var k=bondKey(r.id, o.id);
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
    var k=bondKey(aId, bId);
    var cur=(bonds[k]!=null)? bonds[k] : 50;
    bonds[k]=Math.max(0,Math.min(100, cur + delta));
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
  function offerMeal(meta, visitor, cost, isCooked){
    var C=RC();
    var cooked = (typeof cost === 'boolean') ? cost : (!!isCooked || (cost && cost.isCooked));
    var need = (typeof cost === 'number') ? cost : ((cost && cost.cost != null) ? cost.cost : (C.mealCost!=null?C.mealCost:2));
    var boost = cooked ? ((CFG.residents && CFG.residents.mealImpressCooked) || 35) : (C.mealImpress!=null?C.mealImpress:20);
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
    return { ok:true, impression:visitor.impression, food:meta.res.food, cost:need, isCooked:cooked, boost:boost };
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

  function bumpWalkPh(e, dt){
    var fps=(CFG.humanoid&&CFG.humanoid.walkFps)!=null?CFG.humanoid.walkFps:10;
    e.walkPh=(e.walkPh||0)+(dt||0)*fps;
  }

  /* 直线走向目标(无寻路): 到达后停下. 坐标不落盘 */
  function walkToward(e, target, dt, speed){
    if(!e || !target) return e;
    /* #68: 睡着居民不移动(俯卧贴地): 冻结位置并清走位残留 */
    /* #69: 医疗舱俯卧者同守卫(防御; updateResidents 已短路) */
    if(e.isSleeping || e.medLying){ e.walking = false; return e; }
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
    bumpWalkPh(e, dt);
    return e;
  }

  /* ---------- T3 绕墙走位 (issue #76): walkToward 的寻路升级 ----------
     grid: APH.Nav.gridOf(colony.buildings) 障碍矩阵(调用方每帧构建复用)
     无墙/无 grid → 直线退化 = walkToward 原语义(逐帧一致);
     有墙 & 视线被挡 → Nav.astar 绕行, 路径缓存 e.path/e.pathI (followPath 消费);
     寻路失败 → 退化直线, 不卡死。
     缓存触发重算: 目标变更(e.pathGoal 比对) 或 到段(path 走完)。 */
  function clearPathCache(e){
    e.path=null; e.pathI=0; e.pathGoal=null;
  }
  function hasWall(grid){
    for(var y=0;y<grid.length;y++){
      var row=grid[y];
      for(var x=0;x<row.length;x++) if(row[x]===1) return true;
    }
    return false;
  }
  function walkAround(e, target, dt, speed, grid){
    if(!e || !target || target.x==null || target.y==null) return e;
    /* 守卫同 walkToward (#68/#69); 顺带清路径缓存(沉睡后旧路径无意义) */
    if(e.isSleeping || e.medLying){ e.walking=false; clearPathCache(e); return e; }
    var C=CFG.walk||{};
    var spd=speed!=null?speed:(C.speed!=null?C.speed:56);
    /* 无墙=退化为逐帧直线(walkToward 原语义, 路径缓存清空) */
    /* 防御: Nav 模块缺失(旧测试桩未加载 nav.js)时同样退化直线 */
    if(!window.APH.Nav || !grid || !hasWall(grid)){
      clearPathCache(e);
      return walkToward(e, target, dt, speed);
    }
    var eps=(CFG.navWalk&&CFG.navWalk.goalEps!=null)?CFG.navWalk.goalEps:1e-6;
    var goal=e.pathGoal;
    var sameGoal=!!goal && Math.abs(goal.x-target.x)<eps && Math.abs(goal.y-target.y)<eps;
    /* 缓存命中: 目标未变且路径未走完 → 沿 e.path 继续 (followPath 消费) */
    if(sameGoal && e.path && e.path.length && e.pathI>=0 && e.pathI<e.path.length){
      APH.Nav.followPath(e, e.path, dt, spd);
      if(e.walking) bumpWalkPh(e, dt);
      return e;
    }
    var p=APH.Nav.astar(grid, e, target);
    if(!p || !p.length){
      /* 寻路失败(封闭/目标在墙内): 退化直线, 不卡死 */
      clearPathCache(e);
      return walkToward(e, target, dt, speed);
    }
    e.pathGoal={x:target.x, y:target.y};
    APH.Nav.followPath(e, p, dt, spd);
    if(e.walking) bumpWalkPh(e, dt);
    return e;
  }

  /* 过客在家园院子里闲逛(无寻路): 走一段、站住喘气、到边界折返 */
  function wanderStep(e, dt, hab, yardR, rng, speed){
    var rand = rng || Math.random;
    var V = CFG.visitor || {};
    var H = hab || CFG.HAB;
    var R = yardR || (V.yardR || 220);
    var spd = speed != null ? speed : (V.speed || 48);
    var idleChance = V.idleChance != null ? V.idleChance : 0.35;
    var idleMin = V.idleMin != null ? V.idleMin : 4.2;
    var idleMax = V.idleMax != null ? V.idleMax : 7.0;
    var walkMin = V.walkMin != null ? V.walkMin : 1.4;
    var walkMax = V.walkMax != null ? V.walkMax : 4.6;
    var visType = (CFG.entType && CFG.entType.VISITOR) || 'visitor';
    e.wanderT = (e.wanderT||0) - dt;
    if(e.wanderT <= 0){
      if(!e.wanderIdle && e.type===visType && rand() < idleChance){
        e.wanderIdle = true;
        e.wanderT = idleMin + rand() * Math.max(0, idleMax - idleMin);
      } else {
        e.wanderIdle = false;
        e.wanderA = rand() * Math.PI * 2;
        e.wanderT = walkMin + rand() * Math.max(0, walkMax - walkMin);
      }
    }
    if(e.wanderIdle){
      e.walking = false;
      return e;
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
    e.walking = true;
    e.face = e.wanderA || 0;
    bumpWalkPh(e, dt);
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

  /* 惊醒判定(纯函数): 睡眠中遭遇袭击/炮火/斗殴时强行唤醒, 附带心情惩罚与持续跳数 */
  function disturbSleep(r){
    if(!r || !r.isSleeping) return false;
    var C=RS();
    r.isSleeping = false;
    r.sleepDisturbed = C.disturbedTicks!=null ? C.disturbedTicks : 3;
    var hit = Math.abs(C.disturbedMood!=null ? C.disturbedMood : 4);
    r.mood = Math.max(0, (r.mood||0) - hit);
    return true;
  }

  /* 床位分配(纯函数): 按居住舱(bl_house)与医疗舱(bl_clinic)总容量分配床位, 超容者打地铺 */
  function assignBeds(buildings, residents){
    var cap = (APH.Colony && APH.Colony.housingCapacity) ? APH.Colony.housingCapacity(buildings||[]) : 2;
    (residents||[]).forEach(function(r, idx){
      if(idx < cap){
        r.bedId = r.bedId || ('bed_' + (idx + 1));
      }else{
        r.bedId = null;
      }
    });
    return residents;
  }

  /* #69 病重/击倒判定(纯函数): 病情严格超阈值或已击倒 → 需要医疗舱床位 */
  function needsMedBed(r){
    if(!r || r.medLying) return false;
    if(r.downed) return true;
    var C=RS();
    var at=C.sickBedAt!=null ? C.sickBedAt : 50;
    return (r.illness||0) > at;
  }

  /* #69 医疗舱床位坐标(纯函数): 与 residentSpot 同款偏移, 无床位注册表 */
  function clinicBedSpot(b){
    return { x:(b&&b.x||0)+16, y:(b&&b.y||0)+22 };
  }

  /* 三维机能损毁派生(纯函数): Moving, Manipulation, Consciousness (0%~100%) (Survival #16) */
  function capacitiesOf(r){
    if(!r) return { moving:1.0, manipulation:1.0, consciousness:1.0 };
    var C=RS();
    var woundSev=0, infectSev=0, plagueSev=0;
    (r.ailments||[]).forEach(function(a){
      if(a.type==='wound') woundSev += (a.sev||0);
      else if(a.type==='infection') infectSev += (a.sev||0);
      else if(a.type==='plague') plagueSev += (a.sev||0);
    });
    var painTotal = r.illness||0;
    var coldExposure = r.exposure||0;
    var restVal = r.rest!=null ? r.rest : 100;

    var woundMoveK = C.woundMoveCut!=null ? C.woundMoveCut : 0.005;
    var coldMoveK = C.coldMoveCut!=null ? C.coldMoveCut : 0.003;
    var infectManipK = C.infectManipCut!=null ? C.infectManipCut : 0.008;
    var woundManipK = C.woundManipCut!=null ? C.woundManipCut : 0.004;
    var plagueConK = C.plagueConCut!=null ? C.plagueConCut : 0.009;
    var painConK = C.painConCut!=null ? C.painConCut : 0.003;
    var tiredConK = C.tiredConCut!=null ? C.tiredConCut : 0.2;

    var moving = Math.max(0.1, Math.min(1.0, 1.0 - (woundSev * woundMoveK) - (coldExposure * coldMoveK)));
    var manipulation = Math.max(0.1, Math.min(1.0, 1.0 - (infectSev * infectManipK) - (woundSev * woundManipK)));
    var conPenalty = (plagueSev * plagueConK) + (painTotal * painConK) + (restVal < 15 ? tiredConK : 0);
    var consciousness = Math.max(0.0, Math.min(1.0, 1.0 - conPenalty));

    // 认知机能作为全局天花板上限
    moving = Math.min(moving, consciousness);
    manipulation = Math.min(manipulation, consciousness);

    return {
      moving: Math.round(moving * 1000) / 1000,
      manipulation: Math.round(manipulation * 1000) / 1000,
      consciousness: Math.round(consciousness * 1000) / 1000
    };
  }

  /* 休闲娱乐补充(纯函数): 漫步观星/聚会社交补充娱乐值 (Survival #18) */
  function enjoyRecreation(r, gain){
    if(!r) return r;
    var C=RS();
    var add = gain!=null ? gain : (C.recreationGain!=null ? C.recreationGain : 25);
    r.recreation = Math.min(100, (r.recreation!=null ? r.recreation : 80) + add);
    return r;
  }

  /* 击倒判定(纯函数): 认知<30% 或 移动<15% 时触发击倒昏迷 (Survival #17) */
  function checkDowned(r){
    if(!r) return false;
    if(r.downed) return true;
    var cap = capacitiesOf(r);
    var C = RS();
    var conAt = C.downedConAt!=null ? C.downedConAt : 0.30;
    var moveAt = C.downedMoveAt!=null ? C.downedMoveAt : 0.15;
    if(cap.consciousness < conAt || cap.moving < moveAt){
      r.downed = true;
      r.isSleeping = false;
      r.job = null;
      r.bleedOutTimer = r.bleedOutTimer!=null ? r.bleedOutTimer : (C.bleedOutTime!=null ? C.bleedOutTime : 90);
      return true;
    }
    return false;
  }

  /* 紧急救援与濒死状态机(纯函数): 倒计时衰减、送医用药止血与超时死亡 (Survival #17) */
  function rescueTick(residents, buildings, dt, hasMed, opts){
    var C = RS();
    var dead = [];
    var medUsed = false;
    var inClinic = !!(opts && opts.inClinic);
    (residents||[]).forEach(function(r){
      if(!r || !r.downed) return;
      if(inClinic && hasMed){
        r.downed = false;
        r.bleedOutTimer = null;
        r.rescuedBy = null;
        treatAilment(r, 15, true);
        medUsed = true;
        return;
      }
      r.bleedOutTimer = (r.bleedOutTimer!=null ? r.bleedOutTimer : (C.bleedOutTime!=null ? C.bleedOutTime : 90)) - dt;
      if(r.bleedOutTimer <= 0){
        dead.push(r.id);
      }
    });
    if(dead.length > 0){
      var grief = Math.abs(C.deathGriefMood!=null ? C.deathGriefMood : 8);
      (residents||[]).forEach(function(r){
        if(r && dead.indexOf(r.id) < 0){
          r.mood = Math.max(0, (r.mood||0) - grief * dead.length);
        }
      });
    }
    return { dead: dead, medUsed: medUsed };
  }

  /* 室内避难所判定(纯函数): 核心区域或靠近已建成建筑(<=48px)判定为室内避难所 (Survival #19) */
  function isSheltered(pos, buildings, hab){
    if(!pos) return false;
    var H = hab || CFG.HAB || { x:1100, y:1100, r:92 };
    if(U.dst(pos.x, pos.y, H.x, H.y) <= (H.r || 92)) return true;
    var r = (CFG.residents && CFG.residents.shelterRadius != null) ? CFG.residents.shelterRadius : 48;
    return (buildings||[]).some(function(b){
      return U.dst(pos.x, pos.y, b.x, b.y) <= ((b.size||32)/2 + r);
    });
  }

  /* T9 房间避难 (issue #82): 房间内=免疫极端天气暴露 (墙/门围合, 见 Nav.roomsOf)
     优先级: 返回 null=无房间信息(调用方回退 isSheltered); true/false=房间内/外(后者仍需 isSheltered 补充) */
  function roomShelter(pos, rooms){
    if(!pos || !rooms || !rooms.length) return null;
    return window.APH.Nav && window.APH.Nav.inRooms ? window.APH.Nav.inRooms(pos, rooms) : false;
  }

  /* W3 装备减免(纯函数): 当前所穿防具 suit 的指定抗性 (acidResist/cryoResist), 无装=0 */
  function suitResistOf(r, key){
    var g = r && r.gear;
    var suit = (g && g.suit) ? ((CFG.items && CFG.items[g.suit]) || null) : null;
    return (suit && suit[key] != null) ? suit[key] : 0;
  }
  /* 酸雨类天气判定: 家园 wx_acid + 远征遗留 lw_night_acid/toxic 兼容 */
  function isAcidWx(t){ return t==='wx_acid' || t==='lw_night_acid' || t==='toxic'; }
  /* W3 天气移动乘子(纯函数): 室外 ×speedMul(雨0.7/雪0.8/暴雪0.6/寒潮0.85/酸雨0.85);
     室内避难所免罚; 寒潮+防寒服(it_suit_cryo)=免减速。 */
  function weatherMoveMul(r, weatherType, speedMul, sheltered){
    var mul = (speedMul != null) ? speedMul : 1;
    if(weatherType === 'wx_cold' && suitResistOf(r, 'cryoResist') > 0) return 1;
    return sheltered ? 1 : mul;
  }

  /* ADR-25: 极端温度生理失调 (失温/中暑) 纯函数 */
  function thermalStressTick(entity, envTemp, suitItem, dt, nearWarmth){
    if(!entity) return { hypothermia:0, heatstroke:0, speedMul:1, downed:false };
    var temp = envTemp != null ? envTemp : 22;
    var C = (CFG.temperature) || {};
    var minT = C.comfortMin != null ? C.comfortMin : 10;
    var maxT = C.comfortMax != null ? C.comfortMax : 35;

    if(suitItem && suitItem.cryoResist){
      minT = C.cryoSuitColdFloor != null ? C.cryoSuitColdFloor : -35;
    }
    if(suitItem && suitItem.acidResist){
      maxT = 45;
    }

    var step = (dt != null ? dt : 30) / 30;
    var hypo = entity.hypothermia || 0;
    var heat = entity.heatstroke || 0;

    if(temp < minT){
      if(nearWarmth){
        hypo = Math.max(0, hypo - 15 * step);
      } else {
        var coldDelta = minT - temp;
        var gain = Math.min(25, coldDelta * 0.5 * step);
        hypo = Math.min(100, hypo + gain);
      }
    } else if(temp > maxT){
      var heatDelta = temp - maxT;
      var hGain = Math.min(25, heatDelta * 0.5 * step);
      heat = Math.min(100, heat + hGain);
    } else {
      hypo = Math.max(0, hypo - 15 * step);
      heat = Math.max(0, heat - 15 * step);
    }

    entity.hypothermia = Math.round(hypo * 10) / 10;
    entity.heatstroke = Math.round(heat * 10) / 10;

    var speedMul = 1.0;
    if(entity.hypothermia > 40 || entity.heatstroke > 40) speedMul = 0.70;
    var downed = (entity.hypothermia >= 100 || entity.heatstroke >= 100);

    return {
      hypothermia: entity.hypothermia,
      heatstroke: entity.heatstroke,
      speedMul: speedMul,
      downed: downed
    };
  }

  /* 气候暴露与急性伤病转化(纯函数): 极端天气室外累积、避难所消退、>80 转化伤病 (Survival #19) */
  function exposureTick(r, sheltered, hasExtremeWeather, weatherType){
    if(!r) return r;
    var C = RS();
    var gain = C.exposureGain!=null ? C.exposureGain : 10;
    var cool = C.shelterCooldown!=null ? C.shelterCooldown : 15;
    r.exposure = r.exposure!=null ? r.exposure : 0;

    if(hasExtremeWeather && !sheltered){
      /* W3 装备减免: 酸雨+防酸服(it_suit_hazard) → 暴露增 ×(1-acidResist) */
      if(isAcidWx(weatherType)){
        var resist = suitResistOf(r, 'acidResist');
        if(resist > 0) gain = Math.round(gain * (1 - resist) * 100) / 100;
      }
      r.exposure = Math.min(100, r.exposure + gain);
    }else{
      r.exposure = Math.max(0, r.exposure - cool);
    }

    var disAt = C.exposureDiscomfortAt!=null ? C.exposureDiscomfortAt : 50;
    var disMood = C.exposureDiscomfortMood!=null ? C.exposureDiscomfortMood : -4;
    if(r.exposure >= disAt){
      r.mood = Math.max(0, (r.mood||0) + disMood);
    }

    var acuteAt = C.exposureAcuteAt!=null ? C.exposureAcuteAt : 80;
    var acuteSev = C.exposureAcuteSev!=null ? C.exposureAcuteSev : 12;
    if(r.exposure >= acuteAt){
      var type = isAcidWx(weatherType) ? 'infection' : 'wound';
      addAilment(r, type, acuteSev);
      r.exposure = 40;
    }
    return r;
  }

  /* ---------- P1b 玩家暴露结算 (issue #93, 纯函数) ----------
     与居民 exposureTick 同语义但**不转化伤病/不加心情**（显式裁剪）:
       - 极端天气室外: exposure +CFG.player.exposureGain (酸雨/寒潮照装备减免)
       - 室内/房间: 快速消退 -CFG.player.exposureDecay
       - 暴露值域 0~100; 老档缺失兜底 0 (由 ensurePlayerNeeds 做)
     返回值: needs(原地改) + amount(本跳净变化, 供 HUD/浮标)。 */
  function playerExposureTick(needs, sheltered, hasExtremeWeather, weatherType){
    if(!needs) return needs;
    var P = CFG.player || {};
    var gain = P.exposureGain != null ? P.exposureGain : 8;
    var decay = P.exposureDecay != null ? P.exposureDecay : 12;
    needs.exposure = needs.exposure != null ? needs.exposure : 0;
    var before = needs.exposure;
    if(hasExtremeWeather && !sheltered){
      var g = gain;
      if(isAcidWx(weatherType)){
        var r = suitResistOf(needs, 'acidResist');
        if(r > 0) g = Math.round(g * (1 - r) * 100) / 100;
      }
      needs.exposure = Math.min(100, needs.exposure + g);
    }else{
      needs.exposure = Math.max(0, needs.exposure - decay);
    }
    return { needs: needs, amount: needs.exposure - before };
  }

  /* 篝火身心与社交光环(纯函数) (Cooking #49) */
  function campfireAuraTick(residents, campfires, opts){
    opts = opts || {};
    var C = RS();
    var socR = C.campfireSocialR != null ? C.campfireSocialR : 90;
    var warmR = C.campfireWarmR != null ? C.campfireWarmR : 90;
    var relief = C.campfireExposureRelief != null ? C.campfireExposureRelief : 15;
    var recGain = C.campfireRecGain != null ? C.campfireRecGain : 10;
    var bondGain = C.campfireBondGain != null ? C.campfireBondGain : 3;
    var moodGain = C.campfireMoodGain != null ? C.campfireMoodGain : 1;
    var cap = C.moodCap != null ? C.moodCap : 95;

    var resList = residents || [];
    var fireList = campfires || [];
    var warmed = [];
    var gatheredMap = {};

    fireList.forEach(function(fire, fIdx){
      gatheredMap[fIdx] = [];
      resList.forEach(function(r){
        if(!r || r.downed || r.isSleeping) return;
        var rx = r.x != null ? r.x : (r.px != null ? r.px : (fire.x || 0));
        var ry = r.y != null ? r.y : (r.py != null ? r.py : (fire.y || 0));
        var d = U.dst(rx, ry, fire.x || 0, fire.y || 0);
        if(d <= warmR){
          r.exposure = Math.max(0, (r.exposure || 0) - relief);
          enjoyRecreation(r, recGain);
          if(warmed.indexOf(r.id) < 0) warmed.push(r.id);
        }
        if(d <= socR){
          gatheredMap[fIdx].push(r);
        }
      });
    });

    var bondsUpdated = false;
    var socialPairs = [];
    var meta = opts.meta;
    for(var k in gatheredMap){
      var group = gatheredMap[k];
      if(group.length >= 2){
        for(var i = 0; i < group.length; i++){
          var ra = group[i];
          ra.mood = Math.min(cap, (ra.mood || 70) + moodGain);
          for(var j = i + 1; j < group.length; j++){
            var rb = group[j];
            socialPairs.push([ra.id, rb.id]);
            if(meta){
              meta.bonds = applyBond(meta.bonds || {}, ra.id, rb.id, bondGain);
              bondsUpdated = true;
            }
          }
        }
      }
    }

    return {
      warmed: warmed,
      gatheredCount: socialPairs.length,
      pairs: socialPairs,
      bondsUpdated: bondsUpdated
    };
  }

  /* T9 房间心情增益 (issue #82): 所在房间含居住舱(bl_house) = 卧室级 → 心情增益
     纯函数: pos=世界坐标, rooms=Nav.roomsOf() 输出, buildings=建筑记录; 返回 >=0 的增益值 */
  /* T9/P3b 房间心情增益 (issue #82/#97): 所在房间内 → 卧室级(含居住舱) + 家具加成
     纯函数: pos=世界坐标, rooms=Nav.roomsOf() 输出, buildings=建筑记录; 返回 >=0 的聚合增益值
     家具加成: 房间 bbox 内每件家具按 CFG.residents.furnitureMood[id] 累加 */
  function roomMoodGain(pos, rooms, buildings){
    var C=RS();
    if(!pos || !rooms || !rooms.length || !buildings) return 0;
    var G=CFG.GRID||48;
    var gx=Math.floor((pos.x||0)/G), gy=Math.floor((pos.y||0)/G);
    var room=null;
    for(var i=0;i<rooms.length;i++){
      var r=rooms[i];
      if(gx<r.minX||gx>r.maxX||gy<r.minY||gy>r.maxY) continue;
      for(var j=0;j<r.cells.length;j++){
        if(r.cells[j].gx===gx && r.cells[j].gy===gy){ room=r; break; }
      }
      if(room) break;
    }
    if(!room) return 0;
    var bedGain=(C.roomMoodGain!=null)?C.roomMoodGain:2;
    var fm=C.furnitureMood||{};
    var total=0;
    var inBedRoom=false;
    /* 聚合: 房间 bbox 内 bl_house(卧室级) 与家具逐件加成 */
    for(var k=0;k<buildings.length;k++){
      var b=buildings[k];
      if(!b) continue;
      var bx=Math.floor((b.x||0)/G), by=Math.floor((b.y||0)/G);
      if(bx<room.minX||bx>room.maxX||by<room.minY||by>room.maxY) continue;
      if(b.id==='bl_house'){ inBedRoom=true; }
      else if(fm[b.id] != null){ total += fm[b.id]; }
    }
    if(inBedRoom) total += bedGain;
    return total;
  }

  /* ---------- 念头上下文 (ADR-37) ----------
     把世界状态翻译成 collectThoughts 认识的字段。
     曾经 main.js 与 ui.js 各有一份(thoughtCtxAt / thoughtCtxOf), 字段还不一样 ——
     指挥官的检查器因此又开始对玩家撒谎(缺美观/房间/同室三项)。
     现在收成一份, 挂在拥有「念头」这个概念的模块上。 */
  function thoughtCtxAt(x, y, env){
    var s = window.APH.state || {};
    var TC = CFG.thoughtCtx || {};
    var T = (CFG.entType) || {};
    env = env || {};
    var room = (window.APH.Nav && APH.Nav.roomAt) ? APH.Nav.roomAt({x:x,y:y}, env.rooms||[]) : null;
    var sheltered = !!room;
    var temp = (room && room.temp!=null) ? room.temp : env.ambT;
    var fireR = TC.fireR!=null?TC.fireR:220;
    var fireNearby = ((s.colony&&s.colony.fires)||[]).some(function(f){
      return f && U.dst(f.x,f.y,x,y) <= fireR;
    });
    var corpseR = TC.corpseR!=null?TC.corpseR:220;
    var corpseNearby = (s.entities||[]).some(function(e){
      return e && !e.dead && e.type===(T.CORPSE||'corpse') && U.dst(e.x,e.y,x,y) <= corpseR;
    });
    var joyR = TC.joyR!=null?TC.joyR:50;
    var atJoy = !!(env.campfire && U.dst(env.campfire.x, env.campfire.y, x, y) <= joyR);
    var filth = (APH.Colony && APH.Colony.filthAt)
      ? APH.Colony.filthAt((s.colony&&s.colony.filth)||{}, x, y) : 0;
    /* T9 房间品质 + P2 美观 + ADR-22 同室死敌: 以前是 residentsTick 里对
       r.mood 的两次事后加减, 现在统一成念头, 检查器能说出理由。
       美观要按「这个房间里的」污秽与尸体算, 所以先按房间格子汇总。 */
    var roomMood = 0, roomPretty = false;
    if(room && APH.Res && APH.Res.roomBeauty){
      var filthMap = (s.colony && s.colony.filth) || {};
      var G = CFG.GRID || 48;
      var filthSum = 0, ci;
      if(APH.Colony && APH.Colony.filthAt){
        for(ci=0; ci<room.cells.length; ci++){
          var rc = room.cells[ci];
          filthSum += APH.Colony.filthAt(filthMap, rc.gx*G + G/2, rc.gy*G + G/2) || 0;
        }
      }
      var corpseN = 0;
      (s.entities||[]).forEach(function(e){
        if(!e || e.dead || e.type !== (T.CORPSE||'corpse')) return;
        var egx = Math.floor((e.x||0)/G), egy = Math.floor((e.y||0)/G);
        if(egx<room.minX||egx>room.maxX||egy<room.minY||egy>room.maxY) return;
        corpseN++;
      });
      var bty = APH.Res.roomBeauty({x:x,y:y}, env.rooms||[], (s.colony&&s.colony.buildings)||[],
                                   { filth: filthSum, corpses: corpseN });
      if(bty){ roomMood = bty.mood; roomPretty = bty.pretty; }
    }
    var roomFriction = 0;
    if(room && env.self && APH.Res && APH.Res.roomFrictionOf && APH.Nav && APH.Nav.roomAt){
      var mates = (env.residents||[]).filter(function(o){
        if(!o || o.id === env.self.id) return false;
        var oEnt = (s.entities||[]).find(function(e){ return e.type===(T.RESIDENT||'resident') && e.id===o.id; });
        return oEnt && APH.Nav.roomAt({x:oEnt.x, y:oEnt.y}, env.rooms||[]) === room;
      });
      roomFriction = APH.Res.roomFrictionOf(env.self, mates, env.bonds);
    }
    return {
      roomMood: roomMood,
      roomPretty: roomPretty,
      roomFriction: roomFriction,
      raid: !!(s.war && s.war.raidActive),
      night: !!env.night,
      sheltered: sheltered,
      exposed: !!env.wxExtreme && !sheltered,
      temp: temp,
      filth: filth,
      fireNearby: fireNearby,
      corpseNearby: corpseNearby,
      atJoy: atJoy
    };
  }

  /* 每跳/每次渲染都要的环境量。main.js 每个生产跳算一次并复用;
     ui.js 渲染检查器时按需算一次 —— 两边拿到的是同一套定义。 */
  function thoughtEnvOf(s){
    s = s || window.APH.state || {};
    var W = window.APH.Weather, Nav = window.APH.Nav, World = window.APH.World;
    var wxId = (W && W.currentId) ? W.currentId(s.meta) : 'wx_clear';
    var wxFx = (W && W.weatherEffects) ? W.weatherEffects(wxId) : {};
    var isDay = (World && World.daylight) ? World.daylight() >= 0.5 : true;
    var season = (W && W.seasonAt) ? W.seasonAt(s.clock, CFG.DAY_LEN) : null;
    var buildings = (s.colony && s.colony.buildings) || [];
    return {
      rooms: (Nav && Nav.roomsOf) ? Nav.roomsOf(buildings) : [],
      ambT: (W && W.ambientTemperatureOf) ? W.ambientTemperatureOf(wxId, isDay, season && season.id) : 22,
      night: !isDay,
      wxExtreme: ((wxFx.exposureGain) || 0) > 0,
      campfire: buildings.find(function(b){ return b && (b.id==='bl_campfire' || b.bid==='bl_campfire'); }),
      self: null, residents: (s.meta && s.meta.residents) || [], bonds: (s.meta && s.meta.bonds) || {},
    };
  }

  /* ---------- P2 美观 Beauty (D2) ----------
     环世界的 Beauty: 好看的东西加分, 难看的东西减分, 脏与尸体拉低。
     此前只有 roomMoodGain 的正向家具加分 —— 把发电机塞进卧室毫无代价,
     于是「布置房间」从来不是一个取舍。这里补上负分那一半。

     纯函数: opts.filth = 房间内污秽总量, opts.corpses = 房间内尸体数
     (由调用方按房间格子汇总, 保持本函数无副作用、node 直测)。
     返回 null = 不在任何房间(露天不谈美观)。 */
  function roomBeauty(pos, rooms, buildings, opts){
    if(!pos || !rooms || !rooms.length || !buildings) return null;
    var C = RS();
    var B = (C.beauty) || {};
    var G = CFG.GRID || 48;
    var gx = Math.floor((pos.x||0)/G), gy = Math.floor((pos.y||0)/G);
    var room = null, i, j;
    for(i=0;i<rooms.length;i++){
      var r = rooms[i];
      if(gx<r.minX||gx>r.maxX||gy<r.minY||gy>r.maxY) continue;
      for(j=0;j<r.cells.length;j++){
        if(r.cells[j].gx===gx && r.cells[j].gy===gy){ room = r; break; }
      }
      if(room) break;
    }
    if(!room) return null;

    /* 正分复用既有家具/卧室聚合, 不另起一套 */
    var score = roomMoodGain(pos, rooms, buildings) || 0;

    /* 负分: 房间 bbox 内的工业设施 */
    var ugly = B.ugly || {};
    for(i=0;i<buildings.length;i++){
      var b = buildings[i];
      if(!b || b.dead) continue;
      var bid = b.id || b.bid;
      if(ugly[bid] == null) continue;
      var bx = Math.floor((b.x||0)/G), by = Math.floor((b.y||0)/G);
      if(bx<room.minX||bx>room.maxX||by<room.minY||by>room.maxY) continue;
      score += ugly[bid];
    }

    opts = opts || {};
    var filthPer = (B.filthPer != null) ? B.filthPer : 0.6;
    var corpsePer = (B.corpsePer != null) ? B.corpsePer : 5;
    score -= (opts.filth || 0) * filthPer;
    score -= (opts.corpses || 0) * corpsePer;

    var div = (B.moodDiv != null && B.moodDiv !== 0) ? B.moodDiv : 2;
    var mood = Math.round(score / div);
    var lo = (B.moodMin != null) ? B.moodMin : -8;
    var hi = (B.moodMax != null) ? B.moodMax : 6;
    if(mood < lo) mood = lo;
    if(mood > hi) mood = hi;

    var prettyAt = (B.prettyAt != null) ? B.prettyAt : 5;
    var uglyAt = (B.uglyAt != null) ? B.uglyAt : -2;
    return {
      score: score,
      mood: mood,
      pretty: score >= prettyAt,
      ugly: score <= uglyAt,
    };
  }

  /* T9: 组合避难判定 — 房间内(true) > 房间外回退 isSheltered(建筑半径) */
  /* ADR-30 / #168: 指挥官与居民共用决策。只出意图，不走路。 */
  function thinkPawn(pawn, world){
    pawn = pawn || {};
    world = world || {};
    if(pawn.drafted || pawn.isSleeping || pawn.downed || pawn.medLying) return { type:'none' };
    var eatBelow = world.eatBelow != null ? world.eatBelow : 60;
    var restSleepAt = world.restSleepAt != null ? world.restSleepAt : 20;
    var restNightAt = world.restNightAt != null ? world.restNightAt : 75;
    var joyAt = world.joyAt != null ? world.joyAt : 30;
    var prio = pawn.prio || {};
    var order = pawn.order || null;
    var ot = order && order.type;

    if(ot === 'gather' && order.flora && !order.flora.dead){
      return { type:'gather', x:order.flora.x, y:order.flora.y, flora:order.flora, force:true };
    }

    var slot = 'any';
    if(pawn.schedule && world.hour != null) slot = scheduleAt(pawn.schedule, world.hour);
    var restStay = (CFG.schedule && CFG.schedule.restStayInBed != null) ? CFG.schedule.restStayInBed : 95;

    var hungry = (pawn.food != null && pawn.food < eatBelow) || ot === 'eat';
    if(hungry){
      if(pawn.nearFood) return { type:'eat_now' };
      if(world.meal) return { type:'eat', x:world.meal.x, y:world.meal.y };
      if(world.berry) return { type:'gather', x:world.berry.x, y:world.berry.y, flora:world.berry, emergency:true };
    }

    var sleepy = ot === 'sleep' || !!pawn.wantSleep ||
      (pawn.rest != null && pawn.rest < restSleepAt) ||
      (!!world.night && pawn.rest != null && pawn.rest < restNightAt) ||
      (slot === 'sleep' && pawn.rest != null && pawn.rest < restStay);
    if(sleepy){
      if(pawn.nearBed) return { type:'sleep_now', bed:true };
      if(world.house) return { type:'sleep', x:world.house.x, y:(world.house.y||0)+18 };
      return { type:'sleep_now', bed:false };
    }

    var forceBuild = ot === 'build';
    var forceHaul = ot === 'haul';
    if(forceBuild && order.x != null && order.y != null){
      return { type:'build', x:order.x, y:order.y };
    }
    if((prio.sk_build > 0 || forceBuild) && world.blueprint){
      return { type:'build', x:world.blueprint.x, y:world.blueprint.y };
    }
    if(pawn.haulCarry && (prio.sk_haul > 0 || forceHaul) && world.storage){
      return { type:'haul_dump', x:world.storage.x, y:world.storage.y, carry:pawn.haulCarry };
    }
    if(pawn.job && pawn.job !== 'blueprint' && !forceHaul && !forceBuild) return { type:'job' };
    if(prio.sk_haul > 0 || forceHaul){
      if(world.drop){
        return { type:'haul', x:world.drop.x, y:world.drop.y, drop:world.drop };
      }
    }

    var recNow = pawn.recreation != null ? pawn.recreation : 80;
    if(slot === 'joy' && recNow < 95 && world.joy){
      return { type:'joy', x:world.joy.x, y:(world.joy.y||0)+12 };
    }

    if(prio.sk_gather > 0 && world.flora){
      return { type:'gather', x:world.flora.x, y:world.flora.y, flora:world.flora };
    }
    if(prio.sk_gather > 0 && world.hunt && !world.hunt.dead){
      return { type:'hunt', x:world.hunt.x, y:world.hunt.y, animal:world.hunt };
    }
    if((prio.sk_haul > 0 || prio.sk_social > 0) && world.filth && world.filth.amt >= 15){
      return { type:'clean', x:world.filth.x, y:world.filth.y, amt:world.filth.amt };
    }
    if(pawn.gathering) return { type:'none' };

    if(slot !== 'work' && recNow < joyAt && world.joy){
      return { type:'joy', x:world.joy.x, y:(world.joy.y||0)+12 };
    }
    return { type:'idle' };
  }

  function shelteredFor(pos, buildings, rooms){
    var rr = roomShelter(pos, rooms);
    if(rr === true) return true;
    return isSheltered(pos, buildings);
  }

  /* ---------- 指挥官自身状态 (ADR-41) ----------
     playerNeeds 是本模块的概念(setPlayerSleeping 一直住这儿), 这几个读取器
     却留在 main.js, 于是提示层想问「指挥官饿不饿」就得先认识 main。 */
  function playerNeedsOf(){
    var s=(window.APH&&APH.state)||null;
    return (s && s.meta && s.meta.playerNeeds) || null;
  }
  function playerSleeping(){ var n=playerNeedsOf(); return !!(n && n.isSleeping); }
  function playerDowned(){   var n=playerNeedsOf(); return !!(n && n.downed); }
  function playerSick(){     var n=playerNeedsOf(); return !!(n && n.illness > 0); }
  function playerFood(){
    var start=(CFG.player&&CFG.player.homeFoodStart!=null)?CFG.player.homeFoodStart:80;
    var n=playerNeedsOf();
    if(!n) return start;
    return (n.food==null) ? start : n.food;
  }
  /* 饥饿阈值(防老档/降级 CFG 缺字段) */
  function foodEatBelow(){
    return (CFG.player&&CFG.player.foodEatBelow!=null)?CFG.player.foodEatBelow:60;
  }

  /* 实体 → 名册里的居民档案 */
  function residentOf(e){
    var id=e&&(e.rid||e.id);
    var s=(window.APH&&APH.state)||null;
    var list=(s && s.meta && s.meta.residents)||[];
    for(var i=0;i<list.length;i++) if(list[i].id===id) return list[i];
    return null;
  }

  /* 招募判定的上下文(joinChance 的入参) —— 概念属于招募, 不属于 main */
  function recruitCtx(vis){
    var s=(window.APH&&APH.state)||null;
    if(!s) return {};
    var start=(CFG.recruit&&CFG.recruit.impressStart)||50;
    return {
      residentCount:(s.meta.residents||[]).length,
      housingCap:APH.Colony.housingCapacity(s.colony.buildings),
      food:APH.Colony.haveStock('food'),
      buildings:(s.colony&&s.colony.buildings)||[],
      raidActive:!!(s.war&&s.war.raidActive),
      impression: vis && vis.impression!=null ? vis.impression : start
    };
  }

  return {
    playerSleeping:playerSleeping, playerDowned:playerDowned, playerSick:playerSick,
    playerFood:playerFood, foodEatBelow:foodEatBelow,
    residentOf:residentOf, recruitCtx:recruitCtx,
    SKILLS:SKILLS, SKILL_NAMES:SKILL_NAMES,
    generate:generate, needsTick:needsTick, eatOnce:eatOnce, eatMeal:eatMeal, efficiency:efficiency, clinicTick:clinicTick,
    playerEatOnce:playerEatOnce,
    homeFoodTick:homeFoodTick, homeRestTick:homeRestTick, homeIllnessTick:homeIllnessTick, ensurePlayerNeeds:ensurePlayerNeeds,
    setPlayerSleeping:setPlayerSleeping, playerWake:playerWake, playerRestTick:playerRestTick,
    playerDownedTick:playerDownedTick,
    hurtResident:hurtResident, applyMed:applyMed,
    disturbSleep:disturbSleep, assignBeds:assignBeds, capacitiesOf:capacitiesOf,
    needsMedBed:needsMedBed, clinicBedSpot:clinicBedSpot,
    enjoyRecreation:enjoyRecreation, checkDowned:checkDowned, rescueTick:rescueTick,
    isSheltered:isSheltered, exposureTick:exposureTick, campfireAuraTick:campfireAuraTick,
    roomShelter:roomShelter, shelteredFor:shelteredFor, roomMoodGain:roomMoodGain,
    thoughtCtxAt:thoughtCtxAt, thoughtEnvOf:thoughtEnvOf,
    roomBeauty:roomBeauty,
    playerExposureTick:playerExposureTick,
    suitResistOf:suitResistOf, weatherMoveMul:weatherMoveMul,
    thermalStressTick:thermalStressTick,
    /* F 健康分型 */
    AILMENT_NAMES:AILMENT_NAMES,
    ensureAilments:ensureAilments, syncIllness:syncIllness,
    addAilment:addAilment, treatAilment:treatAilment, ailmentAge:ailmentAge,
    BREAK_NAMES:BREAK_NAMES, breakTypeOf:breakTypeOf, breakTick:breakTick,
    isBroken:isBroken, lowestBondMate:lowestBondMate,
    canRecruit:canRecruit, recruitInto:recruitInto, wanderStep:wanderStep, walkToward:walkToward,
    diningSeatAlloc:diningSeatAlloc, faceTable:faceTable,
    walkAround:walkAround,
    bumpWalkPh:bumpWalkPh,
    joinIntentOf:joinIntentOf, joinChance:joinChance, attemptRecruit:attemptRecruit,
    chanceLabel:chanceLabel, recruitGate:recruitGate,
    hospitalityRate:hospitalityRate, tickImpression:tickImpression, offerMeal:offerMeal,
    socialTick:socialTick, applyBond:applyBond,
    bondKey:bondKey, relationshipTierOf:relationshipTierOf, keyBondsOf:keyBondsOf,
    workSynergyOf:workSynergyOf, roomFrictionOf:roomFrictionOf,
    canSocialEncounter:canSocialEncounter, triggerSocialEncounter:triggerSocialEncounter,
    attemptIntervention:attemptIntervention, hackTerminal:hackTerminal,
    makeTraderStock:makeTraderStock, tradeOnce:tradeOnce, defaultPrio:defaultPrio,
    globalBonuses:globalBonuses,
    fallbackBio:fallbackBio, enrichBio:enrichBio,
    thinkPawn:thinkPawn,
    defaultSchedule:defaultSchedule, ensureSchedule:ensureSchedule,
    hourOfDay:hourOfDay, cycleScheduleSlot:cycleScheduleSlot, scheduleAt:scheduleAt,
    collectThoughts:collectThoughts, thoughtMoodSum:thoughtMoodSum,
    moodFromThoughts:moodFromThoughts,
    ensureParts:ensureParts, hurtPart:hurtPart, partsMoveMul:partsMoveMul,
    makeCorpse:makeCorpse, buryCorpse:buryCorpse, BODY_PARTS:BODY_PARTS,
    capturePrisoner:capturePrisoner, releasePrisoner:releasePrisoner,
  };
})();
