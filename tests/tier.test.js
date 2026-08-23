/* T2 星球难度分级: tierOf 分布/确定性 + spec.tier 敌人hp缩放 */
'use strict';
const Planet = window.APH.Planet;

test('tierOf: 只返回1/2/3且同seed确定', () => {
  for(let s=1;s<200;s++){
    const t=Planet.tierOf(s);
    if(t<1||t>3) throw new Error('tier越界:'+t);
    if(Planet.tierOf(s)!==t) throw new Error('不确定性');
  }
});
test('tierOf: 分布大致 50/30/20 (mulberry32均匀性)', () => {
  const c={1:0,2:0,3:0};
  for(let s=0;s<1000;s++) c[Planet.tierOf(s)]++;
  if(c[1]<420||c[1]>580) throw new Error('tier1应约50%: '+c[1]);
  if(c[2]<230||c[2]>370) throw new Error('tier2应约30%: '+c[2]);
  if(c[3]>280) throw new Error('tier3应约20%: '+c[3]);
});
test('fallbackPlanet: spec.tier 存在且高tier敌人hp更高', () => {
  let t1=null,t3=null;
  for(let s=0;s<500;s++){
    const t=Planet.tierOf(s);
    if(t1===null&&t===1) t1=s;
    if(t3===null&&t===3) t3=s;
    if(t1!==null&&t3!==null) break;
  }
  const p1=Planet.fallbackPlanet(t1), p3=Planet.fallbackPlanet(t3);
  if(p1.tier!==1||p3.tier!==3) throw new Error('spec.tier 未写入');
  const hp1=p1.enemies.factions[0].hp, hp3=p3.enemies.factions[0].hp;
  if(hp3<=hp1) throw new Error('tier3 hp应更高: '+hp3+' vs '+hp1);
});
