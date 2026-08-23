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
