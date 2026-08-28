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
