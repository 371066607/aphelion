/* V1 全局加成 */
test('globalBonuses: 空居民无加成', () => {
  const gb=Res.globalBonuses([]);
  if(gb.buildCostMul!==1||gb.lorePerTick!==0||gb.moodBoost!==0)
    throw new Error('空名单应无加成: '+JSON.stringify(gb));
});
test('globalBonuses: 建造折扣与下限40%', () => {
  const r1=Res.generate('a',5); r1.skills.sk_build=3;
  let gb=Res.globalBonuses([r1]);
  if(Math.abs(gb.buildCostMul-(1-0.36))>0.01) throw new Error('3级应×0.64: '+gb.buildCostMul);
  r1.skills.sk_build=9;
  gb=Res.globalBonuses([r1]);
  if(gb.buildCostMul<0.4) throw new Error('下限0.4');
});
test('globalBonuses: 学识产出与社交心情上限', () => {
  const a=Res.generate('a',6); a.skills.sk_lore=4;
  const b=Res.generate('b',7); b.skills.sk_social=9;
  const gb=Res.globalBonuses([a,b]);
  if(gb.lorePerTick!==2) throw new Error('学识4应+2/跳: '+gb.lorePerTick);
  if(gb.moodBoost!==2) throw new Error('社交9应封顶+2: '+gb.moodBoost);
});

/* P6-U1/U3/U4/U5/U7: 生成/需求/效率/社交/农田/岗位 */
'use strict';
const Colony = window.APH.Colony;

test('farmTick: 阶段推进与技能加速', () => {
  let p={stage:1,t:0};
  p=Colony.farmTick(p,0);                       // 无农民: 播种需1跳
  if(p.stage!==2) throw new Error('无农民1跳应到stage2: '+p.stage);
  let q={stage:2,t:0};
  q=Colony.farmTick(q,5);                       // 技能5: ×1.6/跳, 需求2 → 两跳累计3.2
  if(Math.abs(q.t-1.6)>0.01) throw new Error('技能5一跳应累计1.6: '+q.t);
  q=Colony.farmTick(q,5);
  if(q.stage!==3) throw new Error('技能加速应两跳成熟: '+q.stage);
});
test('harvestYield: 只有成熟产出', () => {
  if(Colony.harvestYield({stage:2})!==0) throw new Error('未熟应为0');
  if(Colony.harvestYield({stage:3})!==3) throw new Error('成熟应产3');
});
test('jobOutput: 技能越高产出越多, 效率打折生效', () => {
  const rookie=Res.generate('a',11); rookie.skills.sk_farm=1; rookie.mood=80; rookie.food=90;
  const expert=Res.generate('b',22); expert.skills.sk_farm=8; expert.mood=85; expert.food=90;
  const o1=Colony.jobOutput([rookie],'farm'), o2=Colony.jobOutput([expert],'farm');
  if(!(o2>o1)) throw new Error('专家应更高: '+o1+' vs '+o2);
  const starved=Res.generate('c',33); starved.skills.sk_farm=8; starved.mood=20; starved.food=5;
  const o3=Colony.jobOutput([starved],'farm');
  if(o3>=o2) throw new Error('饥饿低落应打折: '+o3+' vs '+o2);
});

/* P6-U1/U4/U7 居民系统纯函数: 生成/需求tick/效率/社交 */
'use strict';
const Res = window.APH.Res;

test('generate: 结构完整, 主技能6~9副3~5其余0~2', () => {
  const r = Res.generate('t1', 42);
  if(!r.id.startsWith('rs_')) throw new Error('id前缀: '+r.id);
  for(const sk of Res.SKILLS){
    const v=r.skills[sk];
    if(v===undefined||v<0) throw new Error('技能缺失');
    if(sk===r.mainSkill && (v<6||v>9)) throw new Error('主技能应6~9: '+v);
    else if(sk===r.subSkill && (v<3||v>5)) throw new Error('副技能应3~5: '+v);
    else if(sk!==r.mainSkill&&sk!==r.subSkill && v>2) throw new Error('其余应0~2: '+v);
  }
  if(r.mood<70||r.mood>94) throw new Error('心情初始70~94');
  if(r.food<80||r.food>94) throw new Error('饱食初始80~94');
});
test('generate: 同seed同居民(ADR-5), 主≠副', () => {
  const a=Res.generate('x',777), b=Res.generate('y',777);
  if(a.name!==b.name || a.mainSkill!==b.mainSkill) throw new Error('确定性破坏');
  if(a.mainSkill===a.subSkill) throw new Error('主副不应相同');
});
test('needsTick: 饿了有粮就吃, 没粮掉饱食', () => {
  const r={food:50, mood:60};
  const out=Res.needsTick(r,true);
  if(!out.ate || r.food!==75) throw new Error('应吃+25: '+r.food);
  const r2={food:50,mood:60};
  Res.needsTick(r2,false);
  if(r2.food!==44) throw new Error('无粮应-6: '+r2.food);
});
test('efficiency: 心情好+吃饱 >1, 饥饿打折', () => {
  const happy={mood:90,food:95};
  const hungry={mood:80,food:10};
  if(Res.efficiency(happy)<=1) throw new Error('好状态应>1: '+Res.efficiency(happy));
  if(Res.efficiency(hungry)>=0.8) throw new Error('饥饿应大幅打折: '+Res.efficiency(hungry));
  if(Res.efficiency(happy)>1.3) throw new Error('上限1.3');
});
test('socialTick: 同岗增更多, 暴脾气+低心情引发矛盾(负增量)', () => {
  const calm={id:'a',trait:'勤恳',mood:70}, calm2={id:'b',trait:'乐观',mood:70};
  const angry={id:'c',trait:'暴脾气',mood:20};
  const out=Res.socialTick([{a:calm,b:calm2,sameJob:true},{a:calm,b:angry,sameJob:true}]);
  if(out[0].delta<=out[1].delta) throw new Error('和睦对增量应更高');
  if(out[1].delta>=0) throw new Error('暴躁低心情应为负: '+out[1].delta);
});
test('applyBond: 无序key归一, 范围clamp 0~100', () => {
  let b={};
  b=Res.applyBond(b,'a','b',10);
  if(b['a|b']!==60) throw new Error('初始50+10=60');
  b=Res.applyBond(b,'b','a',5);
  if(b['a|b']!==65) throw new Error('反向应同一key: '+b['a|b']);
  b=Res.applyBond(b,'a','b',999);
  if(b['a|b']!==100) throw new Error('上限100');
  b=Res.applyBond(b,'a','b',-999);
  if(b['a|b']!==0) throw new Error('下限0');
});
