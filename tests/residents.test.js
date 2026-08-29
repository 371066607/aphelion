/* V2 唯一性与小传 */
test('generate: takenNames 查重', () => {
  const r=Res.generate('u1',9,['青禾·一号']);
  if(r.name==='青禾·一号') throw new Error('应避开已用名');
  const r2=Res.generate('u2',9,[]);
  if(!r2.name) throw new Error('无查重表也应正常命名');
});
test('fallbackBio: 确定性小传含名字与出身', () => {
  const r=Res.generate('b1',42);
  const bio1=Res.fallbackBio(r), bio2=Res.fallbackBio(r);
  if(bio1!==bio2) throw new Error('小传应确定');
  if(bio1.indexOf(r.name)<0 || bio1.indexOf(r.origin)<0) throw new Error('应含名字与出身: '+bio1);
});

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
  p=Colony.farmTick(p,null);                    // 无人在岗: 冻结
  if(p.stage!==1) throw new Error('无人应冻结: '+p.stage);
  p=Colony.farmTick(p,0);                       // 在岗无技能: 播种需1跳
  if(p.stage!==2) throw new Error('在岗1跳应到stage2: '+p.stage);
  let q={stage:2,t:0};
  q=Colony.farmTick(q,5);                       // 技能5: ×1.6/跳, 需求2 → 两跳累计3.2
  if(Math.abs(q.t-1.6)>0.01) throw new Error('技能5一跳应累计1.6: '+q.t);
  q=Colony.farmTick(q,5);
  if(q.stage!==3) throw new Error('技能加速应两跳成熟: '+q.stage);
});
test('farmTick: 效率打折减慢生长', () => {
  let a={stage:2,t:0}, b={stage:2,t:0};
  a=Colony.farmTick(a,5,0,1);
  b=Colony.farmTick(b,5,0,0.5);
  if(!(b.t<a.t)) throw new Error('低效应更慢: '+b.t+' vs '+a.t);
  if(Math.abs(a.t-1.6)>0.01) throw new Error('eff=1 应仍是 1.6: '+a.t);
  if(Math.abs(b.t-0.8)>0.01) throw new Error('eff=0.5 应是 0.8: '+b.t);
});
test('farmTick: 酸雨法则减半生长', () => {
  let a={stage:2,t:0}, b={stage:2,t:0};
  a=Colony.farmTick(a,5,0,1,1);
  b=Colony.farmTick(b,5,0,1,0.5);
  if(Math.abs(a.t-1.6)>0.01) throw new Error('law=1 应 1.6: '+a.t);
  if(Math.abs(b.t-0.8)>0.01) throw new Error('law=0.5 应 0.8: '+b.t);
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
  if(r.illness!==0) throw new Error('病情初始应为0: '+r.illness);
});
test('generate: 同seed同居民(ADR-5), 主≠副', () => {
  const a=Res.generate('x',777), b=Res.generate('y',777);
  if(a.name!==b.name || a.mainSkill!==b.mainSkill) throw new Error('确定性破坏');
  if(a.mainSkill===a.subSkill) throw new Error('主副不应相同');
});
test('homeFoodTick: 家园掉饱食, 远征不掉, 不饿死', () => {
  if (typeof Res.homeFoodTick !== 'function') throw new Error('缺失 APH.Res.homeFoodTick');
  const drain = (APH.CFG.residents && APH.CFG.residents.foodDrain != null) ? APH.CFG.residents.foodDrain : 6;
  const next = Res.homeFoodTick(50, 'home');
  if (next !== 50 - drain) throw new Error('家园应掉饱食 '+drain+', 实际: '+next);
  if (Res.homeFoodTick(50, 'expedition') !== 50) throw new Error('远征饱食不应下降');
  if (Res.homeFoodTick(2, 'home') !== 0) throw new Error('饱食应钳到 0, 不饿死');
});
test('ensurePlayerNeeds: 缺省饱食并兼容旧档', () => {
  if (typeof Res.ensurePlayerNeeds !== 'function') throw new Error('缺失 APH.Res.ensurePlayerNeeds');
  const start = (APH.CFG.player && APH.CFG.player.homeFoodStart != null) ? APH.CFG.player.homeFoodStart : 80;
  const a = Res.ensurePlayerNeeds({});
  if (!a.playerNeeds || a.playerNeeds.food !== start) throw new Error('应写入默认饱食 '+start+': '+JSON.stringify(a.playerNeeds));
  const b = Res.ensurePlayerNeeds({ playerNeeds:{ food:41 } });
  if (b.playerNeeds.food !== 41) throw new Error('已有饱食不得覆盖');
});
test('needsTick: 饿了有粮就吃, 没粮掉饱食', () => {
  const r={food:50, mood:60};
  const out=Res.needsTick(r,true);
  if(!out.ate || r.food!==75) throw new Error('应吃+25: '+r.food);
  const r2={food:50,mood:60};
  Res.needsTick(r2,false);
  if(r2.food!==44) throw new Error('无粮应-6: '+r2.food);
});
test('eatOnce: 饿了才吃一口, 饱了不再吃', () => {
  const r={food:50};
  if(!Res.eatOnce(r) || r.food!==75) throw new Error('应+25: '+r.food);
  if(Res.eatOnce(r)) throw new Error('饱了不应再吃');
});
test('needsTick: 饥饿确定性涨病, 不饿死', () => {
  const r={food:20, mood:50, illness:0};
  Res.needsTick(r, false);
  if(r.food!==14) throw new Error('应再掉饱食: '+r.food);
  if(r.illness!==4) throw new Error('饿应+4病: '+r.illness);
  if(r.mood<=0) throw new Error('本切片不应饿死/心情归零锁死');
});
test('efficiency: 病情超阈值打折', () => {
  const ok={mood:90,food:95,illness:0};
  const sick={mood:90,food:95,illness:80};
  if(!(Res.efficiency(sick)<Res.efficiency(ok))) throw new Error('有病应更低');
  if(Res.efficiency(sick)<0.35) throw new Error('应有地板: '+Res.efficiency(sick));
});
test('clinicTick: 有舱基疗, 有医更快, 无舱吃饱微愈', () => {
  const a={illness:50, food:80};
  Res.clinicTick(a, {hasClinic:true, medicSkill:0});
  if(a.illness!==44) throw new Error('有舱应-6: '+a.illness);
  const b={illness:50, food:80};
  Res.clinicTick(b, {hasClinic:true, medicSkill:5});
  if(b.illness!==38) throw new Error('医5应-12取整: '+b.illness);
  const c={illness:10, food:80};
  Res.clinicTick(c, {hasClinic:false});
  if(c.illness!==9) throw new Error('吃饱无舱应-1: '+c.illness);
  const d={illness:10, food:20};
  Res.clinicTick(d, {hasClinic:false, rng:()=>1});
  if(d.illness!==10) throw new Error('无舱未命中ambient应不变: '+d.illness);
  const e={illness:10, food:20};
  Res.clinicTick(e, {hasClinic:false, rng:()=>0});
  if(e.illness!==12) throw new Error('ambient应+2: '+e.illness);
});
test('hurtResident: 涨病掉心情, 不致死', () => {
  const r={illness:90, mood:20};
  Res.hurtResident(r);
  if(r.illness!==100) throw new Error('应clamp 100: '+r.illness);
  if(r.mood!==8) throw new Error('心情应-12: '+r.mood);
  Res.hurtResident(r, 50);
  if(r.illness!==100) throw new Error('再打仍不超100');
  if(r.mood!==0) throw new Error('心情地板0: '+r.mood);
});
test('applyMed: 降病不致死', () => {
  const r={illness:20};
  Res.applyMed(r);
  if(r.illness!==12) throw new Error('应-8: '+r.illness);
  r.illness=3;
  Res.applyMed(r);
  if(r.illness!==0) throw new Error('地板0: '+r.illness);
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
test('canRecruit: 住宅满拒绝, 有空位通过', () => {
  const p=Res.generate('rc1', 3); p.origin='本地出生'; p.trait='勤恳';
  const no=Res.canRecruit(p, 2, 2);
  if(no.ok || no.why.indexOf('满')<0) throw new Error('满员应拒绝: '+JSON.stringify(no));
  const yes=Res.canRecruit(p, 0, 2);
  if(!yes.ok) throw new Error('有空位应可招');
});
test('recruitInto: 写入名册且不自动上岗', () => {
  const meta={residents:[]};
  const p=Res.generate('rc2', 4); p.origin='本地出生';
  const r=Res.recruitInto(meta, p, 2);
  if(!r.ok || meta.residents.length!==1) throw new Error('应入籍');
  if(meta.residents[0].job) throw new Error('新招不应自动上岗');
  const full=Res.recruitInto(meta, Res.generate('rc3',5), 1);
  if(full.ok) throw new Error('超员应拒绝');
});
test('joinIntent: 难民/游商/过路客', () => {
  if(Res.joinIntentOf({origin:'地球难民船'})!=='refugee') throw new Error('难民船');
  if(Res.joinIntentOf({origin:'冷冻舱幸存者'})!=='refugee') throw new Error('冷冻舱');
  if(Res.joinIntentOf({origin:'游商后代'})!=='trader') throw new Error('游商');
  if(Res.joinIntentOf({origin:'本地出生'})!=='guest') throw new Error('过路客');
});
test('recruitGate: 游商不招, 难民空家必成, 有人断粮拒', () => {
  const trader={origin:'游商后代'};
  const t=Res.recruitGate(trader, {residentCount:0,housingCap:2,food:0});
  if(t.ok || t.why.indexOf('买卖')<0) throw new Error('游商应拒: '+JSON.stringify(t));
  const ref={origin:'地球难民船'};
  const ok=Res.recruitGate(ref, {residentCount:0,housingCap:2,food:0});
  if(!ok.ok) throw new Error('空家难民应成: '+JSON.stringify(ok));
  const starve=Res.recruitGate(ref, {residentCount:2,housingCap:4,food:1});
  if(starve.ok) throw new Error('有人断粮难民应拒');
});
test('joinChance: 过路客粮多/性格/袭击调制', () => {
  const g={origin:'本地出生', trait:'勤恳', mainSkill:'sk_farm'};
  const ctx={residentCount:0,housingCap:2,food:20,buildings:[{id:'bl_farm'}],raidActive:false};
  const hi=Res.joinChance(g, ctx);
  if(!hi.ok || hi.chance<60) throw new Error('勤恳+有粮+农场应高: '+hi.chance);
  const lo=Res.joinChance({origin:'本地出生',trait:'独行',mainSkill:'sk_lore'},
    {residentCount:0,housingCap:2,food:0,buildings:[],raidActive:true});
  if(!lo.ok || lo.chance>=hi.chance) throw new Error('独行断粮袭击应更低: '+lo.chance+' vs '+hi.chance);
});
test('attemptRecruit: 掷骰失败可复现, 成功入籍', () => {
  const guest={origin:'本地出生', trait:'话痨', mainSkill:'sk_farm'};
  const ctx={residentCount:0,housingCap:2,food:0,buildings:[]};
  const meta={residents:[]};
  const fail=Res.attemptRecruit(meta, guest, ctx, ()=>0.99);
  if(fail.ok || fail.why!=='还想再看看') throw new Error('高骰应失败: '+JSON.stringify(fail));
  if(meta.residents.length) throw new Error('失败不应入籍');
  const win=Res.attemptRecruit(meta, guest, ctx, ()=>0);
  if(!win.ok || meta.residents.length!==1) throw new Error('低骰应成功');
});
test('hospitalityRate: 好招待为正, 袭击断粮为负', () => {
  const good=Res.hospitalityRate({residentCount:0,housingCap:2,food:20,buildings:[{id:'bl_clinic'}],raidActive:false});
  const bad=Res.hospitalityRate({residentCount:2,housingCap:2,food:0,buildings:[],raidActive:true});
  if(!(good>0)) throw new Error('好招待应涨印象: '+good);
  if(!(bad<0)) throw new Error('袭击断粮应掉印象: '+bad);
});
test('tickImpression: 好招待随时间上涨且封顶', () => {
  let v=50;
  v=Res.tickImpression(v, 20, {residentCount:0,housingCap:2,food:30,buildings:[{id:'bl_clinic'}]});
  if(!(v>50)) throw new Error('20秒好招待应>50: '+v);
  const cap=Res.tickImpression(99, 50, {residentCount:0,housingCap:2,food:99,buildings:[{id:'bl_clinic'}]});
  if(cap>100) throw new Error('应封顶100: '+cap);
});
test('offerMeal: 扣粮涨印象, 不可连请', () => {
  const meta={res:{food:5}};
  const vis={impression:50, fed:false};
  const a=Res.offerMeal(meta, vis, 2);
  if(!a.ok || meta.res.food!==3) throw new Error('应扣2粮: '+JSON.stringify(a));
  if(vis.impression!==70 || !vis.fed) throw new Error('印象+20且标记已请: '+vis.impression);
  const b=Res.offerMeal(meta, vis, 2);
  if(b.ok) throw new Error('不可连请');
  const poor=Res.offerMeal({res:{food:1}}, {impression:50,fed:false}, 2);
  if(poor.ok) throw new Error('粮不够应拒');
});
test('joinChance: 印象高过路客更好招', () => {
  const g={origin:'本地出生', trait:'话痨', mainSkill:'sk_lore'};
  const base={residentCount:0,housingCap:2,food:5,buildings:[]};
  const low=Res.joinChance(g, Object.assign({}, base, {impression:20}));
  const high=Res.joinChance(g, Object.assign({}, base, {impression:90}));
  if(!(high.chance>low.chance)) throw new Error('高印象应更高: '+high.chance+' vs '+low.chance);
});


test('wanderStep: 院子内移动且不越界', () => {
  const e={x:1100,y:1100,wanderA:0,wanderT:0};
  Res.wanderStep(e, 1, {x:1100,y:1100}, 220, ()=>0.5);
  if(e.x===1100 && e.y===1100) throw new Error('应移动');
  const d=Math.hypot(e.x-1100, e.y-1100);
  if(d>221) throw new Error('不应越出院子: '+d);
});
test('walkToward: 走向目标, 到达后停下', () => {
  const e={x:0,y:0};
  Res.walkToward(e, {x:100,y:0}, 1, 40);
  if(e.x!==40 || e.y!==0 || !e.walking) throw new Error('1秒应走40: '+JSON.stringify(e));
  Res.walkToward(e, {x:100,y:0}, 2, 40);
  if(e.x!==100 || e.walking) throw new Error('应到达并停下: '+JSON.stringify(e));
});
test('walkToward: 不越过目标', () => {
  const e={x:0,y:0};
  Res.walkToward(e, {x:10,y:0}, 1, 100);
  if(e.x!==10 || e.y!==0 || e.walking) throw new Error('不应越过: '+JSON.stringify(e));
});
test('walkToward: 走动推进 walkPh，停下冻结', () => {
  const e={x:0,y:0,walkPh:0};
  Res.walkToward(e, {x:100,y:0}, 1, 40);
  if(!e.walking) throw new Error('应在走');
  if(!(e.walkPh>0)) throw new Error('走时应推进 walkPh, got '+e.walkPh);
  const ph=e.walkPh;
  Res.walkToward(e, {x:100,y:0}, 2, 40);
  if(e.walking) throw new Error('应停下');
  if(e.walkPh!==ph) throw new Error('停下不应继续推进 walkPh, got '+e.walkPh+' vs '+ph);
});
test('wanderStep: 游荡时 walking、朝向、walkPh', () => {
  const e={x:1100,y:1100,wanderA:0,wanderT:10,walkPh:0};
  Res.wanderStep(e, 1, {x:1100,y:1100}, 220, ()=>0.5);
  if(!e.walking) throw new Error('游荡应为 walking');
  if(e.face==null || isNaN(e.face)) throw new Error('应有朝向, got '+e.face);
  if(!(e.walkPh>0)) throw new Error('游荡应推进 walkPh, got '+e.walkPh);
});
test('wanderStep: 站住时 idle，不走不推进 walkPh', () => {
  const e={x:1100,y:1100,wanderA:0,wanderT:5,wanderIdle:true,walkPh:3,walking:false,face:0};
  Res.wanderStep(e, 1, {x:1100,y:1100}, 220, ()=>0.5);
  if(e.walking) throw new Error('站住不应 walking');
  if(e.x!==1100 || e.y!==1100) throw new Error('站住不应位移: '+e.x+','+e.y);
  if(e.walkPh!==3) throw new Error('站住不应推进 walkPh, got '+e.walkPh);
});
test('wanderStep: 站够后重新开走', () => {
  const e={x:1100,y:1100,wanderA:0,wanderT:0,wanderIdle:true,walkPh:3};
  Res.wanderStep(e, 1, {x:1100,y:1100}, 220, ()=>0.5);
  if(e.wanderIdle) throw new Error('站够应结束 idle');
  if(!e.walking) throw new Error('站够应开走');
  if(e.x===1100 && e.y===1100) throw new Error('开走应位移');
});
test('wanderStep: 过客走完低骰站住', () => {
  const e={x:1100,y:1100,wanderA:0,wanderT:0,type:'visitor'};
  Res.wanderStep(e, 0.01, {x:1100,y:1100}, 220, ()=>0.1);
  if(!e.wanderIdle) throw new Error('过客低骰应站住');
  if(e.walking) throw new Error('站住不应 walking');
});
test('wanderStep: 居民游荡不进过客站住', () => {
  const e={x:1100,y:1100,wanderA:0,wanderT:0,type:'resident'};
  Res.wanderStep(e, 1, {x:1100,y:1100}, 220, ()=>0.1);
  if(e.wanderIdle) throw new Error('居民崩溃游荡不应走 visitor idle');
  if(!e.walking) throw new Error('应继续走');
});

/* ---------- B: 心情崩溃 ---------- */
test('breakTypeOf: 性格分流四种崩溃', () => {
  if(Res.breakTypeOf('暴脾气')!=='brawl') throw new Error('暴脾气→斗殴');
  if(Res.breakTypeOf('独行')!=='wander'||Res.breakTypeOf('谨慎')!=='wander')
    throw new Error('独行/谨慎→出走');
  if(Res.breakTypeOf('话痨')!=='tantrum'||Res.breakTypeOf('乐观')!=='tantrum')
    throw new Error('话痨/乐观→怠工');
  if(Res.breakTypeOf('勤恳')!=='binge') throw new Error('勤恳→暴食');
  if(Res.breakTypeOf('未知性格')!=='wander') throw new Error('未知性格兜底出走');
});
test('breakTick: 心情高不崩溃', () => {
  const r={id:'rs_a',mood:80,trait:'暴脾气'};
  const b=Res.breakTick(r, ()=>0);           // rng=0 必命中(若有资格)
  if(b.started) throw new Error('心情80不该崩溃');
  if(Res.isBroken(r)) throw new Error('不应进入崩溃态');
});
test('breakTick: 低心情命中掷骰 → 按性格进入崩溃', () => {
  const r={id:'rs_a',mood:20,trait:'暴脾气'};
  const b=Res.breakTick(r, ()=>0);
  if(b.started!=='brawl') throw new Error('暴脾气低心情应斗殴: '+JSON.stringify(b));
  if(!Res.isBroken(r)) throw new Error('应进入崩溃态');
  if(!(r.breakT>=1 && r.breakT<=2)) throw new Error('持续1~2跳: '+r.breakT);
});
test('breakTick: 大崩溃阈值下概率×3', () => {
  // chance=0.08; mood 20(轻度) rng=0.1 不命中; mood 10(重度) 0.24>0.1 命中
  const a={id:'rs_a',mood:20,trait:'勤恳'};
  const ba=Res.breakTick(a, ()=>0.1);
  if(ba.started) throw new Error('轻度阈值 0.1>0.08 不该命中');
  const b={id:'rs_b',mood:10,trait:'勤恳'};
  const bb=Res.breakTick(b, ()=>0.1);
  if(bb.started!=='binge') throw new Error('重度阈值 0.1<0.24 应命中');
});
test('breakTick: 结束宣泄回弹 + 进冷却, 冷却期不复发', () => {
  const r={id:'rs_a',mood:5,trait:'话痨'};
  Res.breakTick(r, ()=>0);                   // 进入崩溃(1跳)
  r.breakT=1;
  const end=Res.breakTick(r, ()=>0);
  if(end.ended!=='tantrum') throw new Error('应结束: '+JSON.stringify(end));
  if(r.mood<45) throw new Error('宣泄回弹至少45: '+r.mood);
  if(!(r.breakCd>0)) throw new Error('应进冷却');
  r.mood=5;
  const again=Res.breakTick(r, ()=>0);
  if(again.started) throw new Error('冷却期不得复发');
});
test('lowestBondMate: 挑好感最低的同事', () => {
  const a={id:'rs_a'}, b={id:'rs_b'}, c={id:'rs_c'};
  const bonds={ 'rs_a|rs_b':80, 'rs_a|rs_c':20 };
  const m=Res.lowestBondMate(a,[a,b,c],bonds);
  if(m!==c) throw new Error('应挑 rs_c(好感20)');
  const m2=Res.lowestBondMate(a,[a],bonds);
  if(m2!==null) throw new Error('没同事应返回null');
});

/* ---------- C: 游商贸易 ---------- */
test('makeTraderStock: 同seed确定, 结构合法, 价格≥1', () => {
  const a=Res.makeTraderStock(42), b=Res.makeTraderStock(42);
  if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error('同seed应同货单');
  if(a.sells.length<2 || a.sells.length>3) throw new Error('出售应2~3种: '+a.sells.length);
  if(a.buys.length<2 || a.buys.length>3) throw new Error('收购应2~3种: '+a.buys.length);
  const ok=['food','leather','med','alloy','crystal'];
  a.sells.concat(a.buys).forEach(it => {
    if(!(it.price>=1) || !(it.n>=1)) throw new Error('价格/库存非法: '+JSON.stringify(it));
    if(ok.indexOf(it.key)<0) throw new Error('未知商品: '+it.key);
  });
});
test('tradeOnce: 买入扣矿得货, 矿不够拒绝且不扣账', () => {
  const meta={ res:{ mineral:10, med:0 } };
  const stock={ sells:[{key:'med',n:2,price:6}], buys:[] };
  const r=Res.tradeOnce(meta,[],stock,'buy',0,0);
  if(!r.ok || r.cost!==6) throw new Error('买入应成交: '+JSON.stringify(r));
  if(meta.res.mineral!==4 || meta.res.med!==1) throw new Error('账不对: '+JSON.stringify(meta.res));
  if(stock.sells[0].n!==1) throw new Error('游商库存应-1');
  const r2=Res.tradeOnce(meta,[],stock,'buy',0,0);
  if(r2.ok) throw new Error('矿4<6应拒绝');
  if(meta.res.mineral!==4) throw new Error('拒绝时不得扣账');
});
test('tradeOnce: 卖出得矿, 社交议价加成', () => {
  const meta={ res:{ mineral:0, food:5 } };
  const stock={ sells:[], buys:[{key:'food',n:3,price:2}] };
  const r=Res.tradeOnce(meta,[],stock,'sell',0,0.1);
  if(!r.ok) throw new Error('卖出应成交: '+JSON.stringify(r));
  // 2×1.1=2.2 → round 2
  if(meta.res.mineral!==2 || meta.res.food!==4) throw new Error('账不对: '+JSON.stringify(meta.res));
  if(stock.buys[0].n!==2) throw new Error('收购需求应-1');
});
test('tradeOnce: 卖晶体矿扣地上堆', () => {
  const meta={ res:{ mineral:0 } };
  const ents=[{ type:'dropped', itemId:'it_crystal_ore', n:2, x:0, y:0 }];
  const stock={ sells:[], buys:[{key:'crystal',n:3,price:3}] };
  const r=Res.tradeOnce(meta, ents, stock, 'sell', 0, 0);
  if(!r.ok) throw new Error('应卖出晶体: '+JSON.stringify(r));
  if(ents[0].n!==1) throw new Error('地上应-1: '+ents[0].n);
  if(meta.res.mineral!==3) throw new Error('应得3矿: '+meta.res.mineral);
});
test('tradeOnce: 没存货不能卖, 收购额度用完不再收', () => {
  const meta={ res:{ mineral:0, food:0 } };
  const stock={ sells:[], buys:[{key:'food',n:0,price:2}] };
  const r=Res.tradeOnce(meta,[],stock,'sell',0,0);
  if(r.ok) throw new Error('额度0应拒绝');
  stock.buys[0].n=3;
  const r2=Res.tradeOnce(meta,[],stock,'sell',0,0);
  if(r2.ok) throw new Error('没粮应拒绝');
});
test('tradeOnce: 仓不够时用地上堆付款(先仓后堆)', () => {
  const meta={ res:{ mineral:2, med:0 } };
  const ents=[{ type:'dropped', itemId:'it_mineral', n:5, x:0, y:0 }];
  const stock={ sells:[{key:'med',n:1,price:6}], buys:[] };
  const r=Res.tradeOnce(meta, ents, stock, 'buy', 0, 0);
  if(!r.ok) throw new Error('仓2+地5=7≥6应成交');
  if(meta.res.mineral!==0) throw new Error('仓应扣光');
  if(ents[0].n!==1) throw new Error('地上堆应扣4: '+ents[0].n);
});
/* ---------- D: 工作优先级 ---------- */
test('defaultPrio: 主技能=1 其余=2', () => {
  const p=Res.defaultPrio({ mainSkill:'sk_farm' });
  if(p.sk_farm!==1) throw new Error('主技能应为1');
  Res.SKILLS.forEach(sk => {
    if(sk!=='sk_farm' && p[sk]!==2) throw new Error(sk+' 应为2');
  });
});
test('defaultPrio: 有现职时按岗位对应技能=1', () => {
  const p=Res.defaultPrio({ mainSkill:'sk_lore', job:'bl_farm' });
  if(p.sk_farm!==1) throw new Error('现职农场应优先农: '+JSON.stringify(p));
  if(p.sk_lore!==2) throw new Error('主技能不应盖过现职');
});
test('assignByPriority: 1级先满足且按技能高者', () => {
  const bs=[{id:'bl_farm'},{id:'bl_mine'}];
  const rs=[
    { id:'rs_a', skills:{sk_farm:8, sk_craft:2} },
    { id:'rs_b', skills:{sk_farm:3, sk_craft:6} },
  ];
  const prio={ rs_a:{sk_farm:1,sk_craft:2}, rs_b:{sk_farm:2,sk_craft:1} };
  const out=Colony.assignByPriority(rs, bs, prio, false);
  if(out.rs_a!=='bl_farm') throw new Error('rs_a 农1级应种田: '+out.rs_a);
  if(out.rs_b!=='bl_mine') throw new Error('rs_b 矿1级应挖矿: '+out.rs_b);
});
test('assignByPriority: 0=禁止永不指派', () => {
  const bs=[{id:'bl_farm'}];
  const rs=[{ id:'rs_a', skills:{sk_farm:9} }];
  const out=Colony.assignByPriority(rs, bs, { rs_a:{sk_farm:0} }, false);
  if(out.rs_a!==null) throw new Error('禁止的活不该派: '+out.rs_a);
});
test('assignByPriority: 手动锁岗不动, 崩溃者缺勤', () => {
  const bs=[{id:'bl_farm'},{id:'bl_lab'}];
  const rs=[
    { id:'rs_lock', job:'bl_lab', jobLocked:true, skills:{sk_farm:9} },
    { id:'rs_brk', skills:{sk_farm:9}, breakType:'wander', breakT:1 },
    { id:'rs_c', skills:{sk_farm:1} },
  ];
  const out=Colony.assignByPriority(rs, bs, {}, false);
  if(out.rs_lock!=='bl_lab') throw new Error('锁岗应保留: '+out.rs_lock);
  if(out.rs_brk!==null) throw new Error('崩溃者应缺勤: '+out.rs_brk);
  if(out.rs_c!=='bl_farm') throw new Error('剩下的人应补farm: '+out.rs_c);
});
test('assignByPriority: 有施工队列时建造者留空', () => {
  const bs=[{id:'bl_mine'}];
  const rs=[{ id:'rs_bd', mainSkill:'sk_build', skills:{sk_build:7, sk_craft:5} }];
  const busy=Colony.assignByPriority(rs, bs, {}, true);
  if(busy.rs_bd!==null) throw new Error('施工期建造者应留空: '+busy.rs_bd);
  const idle=Colony.assignByPriority(rs, bs, {}, false);
  if(idle.rs_bd!=='bl_mine') throw new Error('没工地该去挖矿: '+idle.rs_bd);
  const banned=Colony.assignByPriority(rs, bs, { rs_bd:{sk_build:0,sk_craft:2} }, true);
  if(banned.rs_bd!=='bl_mine') throw new Error('建造被禁止时不留空: '+banned.rs_bd);
});
test('assignByPriority: 同级粘性——现职同级不换岗', () => {
  const bs=[{id:'bl_clinic'},{id:'bl_workshop'}];
  const rs=[{ id:'rs_w', job:'bl_workshop', skills:{sk_craft:5, sk_social:5} }];
  const out=Colony.assignByPriority(rs, bs, {}, false);
  if(out.rs_w!=='bl_workshop') throw new Error('同级应留任工坊: '+out.rs_w);
});
test('assignByPriority: 更高优先级空位会抢走现职', () => {
  const bs=[{id:'bl_farm'},{id:'bl_mine'}];
  const rs=[{ id:'rs_a', job:'bl_mine', skills:{sk_farm:5, sk_craft:5} }];
  const out=Colony.assignByPriority(rs, bs, { rs_a:{sk_farm:1, sk_craft:2} }, false);
  if(out.rs_a!=='bl_farm') throw new Error('农1级应把人从矿抢来: '+out.rs_a);
});
test('assignByPriority: 岗位数受建筑数约束', () => {
  const bs=[{id:'bl_farm'}];      // 1 农场 = 2 席
  const rs=[
    { id:'r1', skills:{sk_farm:5} },
    { id:'r2', skills:{sk_farm:4} },
    { id:'r3', skills:{sk_farm:3} },
  ];
  const out=Colony.assignByPriority(rs, bs, {}, false);
  const onFarm=Object.keys(out).filter(k=>out[k]==='bl_farm');
  if(onFarm.length!==2) throw new Error('农场只有2席: '+onFarm.length);
  if(out.r3!==null) throw new Error('技能最低者落选');
});
test('assignByPriority: 重病居民跳过指派', () => {
  const bs=[{id:'bl_farm'}];
  const rs=[{ id:'rs_s', skills:{sk_farm:9}, illness:80 }];
  const out=Colony.assignByPriority(rs, bs, {}, false);
  if(out.rs_s!==null) throw new Error('重病应缺勤: '+out.rs_s);
  const mild=Colony.assignByPriority([{ id:'rs_m', skills:{sk_farm:5}, illness:20 }], bs, {}, false);
  if(mild.rs_m!=='bl_farm') throw new Error('轻病仍应上岗: '+mild.rs_m);
});

test('globalBonuses: tradeMul 随社交封顶', () => {
  const a=Res.generate('t1',3); a.skills.sk_social=3;
  let gb=Res.globalBonuses([a]);
  if(Math.abs(gb.tradeMul-0.06)>1e-9) throw new Error('社交3应6%: '+gb.tradeMul);
  a.skills.sk_social=9;
  gb=Res.globalBonuses([a]);
  if(Math.abs(gb.tradeMul-0.12)>1e-9) throw new Error('封顶12%: '+gb.tradeMul);
});

/* ---------- F 健康分型 ---------- */
test('ensureAilments: 旧档 illness>0 迁移为一条外伤', () => {
  const r={illness:30};
  Res.ensureAilments(r);
  if(r.ailments.length!==1||r.ailments[0].type!=='wound'||r.ailments[0].sev!==30)
    throw new Error('应迁移为外伤30: '+JSON.stringify(r.ailments));
  const h={illness:0};
  Res.ensureAilments(h);
  if(h.ailments.length!==0) throw new Error('健康者应空数组');
});
test('addAilment: 同型合并, 满2条加到最重', () => {
  const r={illness:0, ailments:[]};
  Res.addAilment(r,'wound',10);
  Res.addAilment(r,'wound',5);
  if(r.ailments.length!==1||r.ailments[0].sev!==15) throw new Error('同型应合并15');
  Res.addAilment(r,'plague',20);
  if(r.ailments.length!==2) throw new Error('应2条');
  Res.addAilment(r,'infection',6);            // 满了 → 加到最重(plague 20)
  if(r.ailments.length!==2) throw new Error('不应超过 ailMax=2');
  const pl=r.ailments.find(a=>a.type==='plague');
  if(pl.sev!==26) throw new Error('应加到最重的疫病: '+pl.sev);
  if(r.illness!==15+26) throw new Error('聚合值应41: '+r.illness);
});
test('hurtResident: type 参数分型(疫病)', () => {
  const r={illness:0, mood:80, ailments:[]};
  Res.hurtResident(r, 15, 'plague');
  if(r.ailments[0].type!=='plague') throw new Error('应为疫病');
  if(r.illness!==15) throw new Error('聚合15: '+r.illness);
});
test('ailmentAge: 外伤拖2跳未进舱 → 升级感染+掉心情', () => {
  const r={illness:20, mood:70, ailments:[{type:'wound',sev:20,age:0}]};
  Res.ailmentAge(r,{hasClinic:false});        // age 1
  if(r.ailments[0].type!=='wound') throw new Error('1跳不应升级');
  Res.ailmentAge(r,{hasClinic:false});        // age 2 → 升级
  if(r.ailments[0].type!=='infection') throw new Error('2跳应升级感染');
  if(r.ailments[0].sev!==25) throw new Error('升级应+infectBump=5: '+r.ailments[0].sev);
  if(r.mood!==62) throw new Error('应掉心情8: '+r.mood);
  const c={illness:20, mood:70, ailments:[{type:'wound',sev:20,age:5}]};
  Res.ailmentAge(c,{hasClinic:true});
  if(c.ailments[0].type!=='wound') throw new Error('在舱不应升级');
  const far={illness:20, mood:70, ailments:[{type:'wound',sev:20,age:0}]};
  Res.ailmentAge(far,{hasClinic:true, inClinic:false});
  Res.ailmentAge(far,{hasClinic:true, inClinic:false});
  if(far.ailments[0].type!=='infection') throw new Error('有舱但人没进舱应升级');
});
test('treatAilment: 优先级 感染>疫病>外伤', () => {
  const r={illness:30, ailments:[{type:'wound',sev:10,age:0},{type:'infection',sev:20,age:0}]};
  const hit=Res.treatAilment(r, 6, false);
  if(hit!=='infection') throw new Error('应先治感染: '+hit);
  if(r.ailments.find(a=>a.type==='infection').sev!==14) throw new Error('感染应-6');
});
test('plague: 无药只能压到地板, 用药×2 可除根', () => {
  const r={illness:14, ailments:[{type:'plague',sev:14,age:0}]};
  Res.treatAilment(r, 50, false);             // 医疗舱猛治
  if(r.ailments[0].sev!==12) throw new Error('无药应压到地板12: '+r.ailments[0].sev);
  Res.applyMed(r);                            // medHeal 8 ×2 = 16 ≥ 12
  if(r.ailments.length!==0||r.illness!==0) throw new Error('用药应除根: '+r.illness);
});
test('clinicTick: 吃饱自愈只治外伤, 感染不自愈', () => {
  const w={illness:10, food:80, ailments:[{type:'wound',sev:10,age:0}]};
  Res.clinicTick(w,{hasClinic:false});
  if(w.illness!==9) throw new Error('外伤应自愈-1: '+w.illness);
  const inf={illness:10, food:80, ailments:[{type:'infection',sev:10,age:0}]};
  Res.clinicTick(inf,{hasClinic:false});
  if(inf.illness!==10) throw new Error('感染不应自愈: '+inf.illness);
});
test('efficiency: 感染者效率地板更低', () => {
  const sick={mood:50, food:80, illness:100, ailments:[{type:'wound',sev:100,age:0}]};
  const inf={mood:50, food:80, illness:100, ailments:[{type:'infection',sev:100,age:0}]};
  const es=Res.efficiency(sick), ei=Res.efficiency(inf);
  if(!(ei<es)) throw new Error('感染地板应更低: '+ei+' vs '+es);
});
test('needsTick: 饥饿病计为外伤', () => {
  const r={food:20, mood:50, illness:0, ailments:[]};
  Res.needsTick(r, false);
  if(!r.ailments.some(a=>a.type==='wound')) throw new Error('饿出的病应为外伤');
});
