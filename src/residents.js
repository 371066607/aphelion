/* ============================================================
   Aphelion · residents.js — 殖民者系统 (P6, 用户方向)
   挂载: window.APH.Res
   愿景: 殖民地是有人生活的家。
   - U1 居民数据: 六维技能(建造/种植/畜牧/手工/学识/社交) + 心情 + 饱食度
   - 纯函数优先(node 可测), 世界侧接线在 main.js
   ============================================================ */
window.APH = window.APH || {};

APH.Res = (function(){
  'use strict';
  var U=APH.U;

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
  function generate(id, seed){
    var rng=U.makeRng(seed);
    function pick(a){ return a[Math.floor(rng()*a.length)]; }
    /* 主副技能不重复 */
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
      name:pick(FIRST)+pick(LAST),
      origin:pick(ORIGINS),
      skills:skills, mainSkill:main, subSkill:sub,
      mood:70+Math.floor(rng()*25),                          // 70~94
      food:80+Math.floor(rng()*15),                          // 80~94
      job:null,                                              // 指派岗位 bl_xxx|null
      trait:pick(['勤恳','话痨','独行','乐观','谨慎','暴脾气']),
      arrivedAt:0,
    };
  }

  /* ---------- U4: 饱食/心情 tick(纯函数) ----------
     每30游戏秒一跳: 吃仓库食物; 饿→心情掉; 心情影响效率系数。 */
  function needsTick(r, hasFood){
    var out={ ate:false };
    if(r.food<60 && hasFood){
      r.food=Math.min(100,r.food+25); out.ate=true;          // 吃一份+25
    }else{
      r.food=Math.max(0,r.food-6);                            // 每跳耗6
    }
    if(r.food>65 && r.mood<95) r.mood+=2;                     // 吃饱心情缓升
    else if(r.food<30) r.mood=Math.max(0,r.mood-8);           // 饥饿心情骤降
    else if(r.food<45) r.mood=Math.max(0,r.mood-3);
    return out;
  }

  /* 工作效率系数(纯函数): 心情与饱食共同决定 0.4~1.3 */
  function efficiency(r){
    var moodF=0.55+(r.mood/100)*0.75;                         // 0.55~1.30
    var foodF=r.food>=50?1:(0.5+r.food/100);                  // <50 开始打折
    return Math.round(moodF*foodF*100)/100;
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

  return {
    SKILLS:SKILLS, SKILL_NAMES:SKILL_NAMES,
    generate:generate, needsTick:needsTick, efficiency:efficiency,
    socialTick:socialTick, applyBond:applyBond,
  };
})();
