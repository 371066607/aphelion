
/* rivals.js: AI成长/袭击决策/warScore/波次 */
'use strict';
const R = window.APH.Rivals;

test('growthTick: aggressive 军事增长快于经济', () => {
  const r = { military:10, economy:10, trait:'aggressive' };
  const g = R.growthTick(r, 10);
  const dMil = g.military-10, dEco = g.economy-10;
  if(!(dMil > dEco)) throw new Error('aggressive 应军>经: '+dMil+' vs '+dEco);
  if(r.military!==10) throw new Error('原对象被修改(应纯函数)');
});
test('growthTick: trader 经济增长快于军事', () => {
  const g = R.growthTick({military:10,economy:10,trait:'trader'},10);
  if(!((g.economy-10) > (g.military-10))) throw new Error('trader 应经>军');
});
test('shouldRaid: 军力不足1.3倍防御 → 不袭', () => {
  const r = { military:20, trait:'aggressive' };
  const d = R.shouldRaid(r, 30, 99);          // 20 < 39
  if(d.should) throw new Error('军力不足不应袭击');
});
test('shouldRaid: 优势+愤怒满 → 袭', () => {
  const r = { military:60, trait:'aggressive' };
  const d = R.shouldRaid(r, 20, 10);           // 60>26, anger10>4.4
  if(!d.should) throw new Error('优势应袭击: '+d.reason);
});
test('shouldRaid: trader 几乎不打(愤怒需求×4)', () => {
  const r = { military:100, trait:'trader' };
  const early = R.shouldRaid(r, 20, 10);
  if(early.should) throw new Error('trader anger=10 不该打');
  const late = R.shouldRaid(r, 20, 20);
  if(!late.should) throw new Error('trader 愤怒极久仍应打');
});
test('warScore: 边界 0~100 且军力占主导', () => {
  if(R.warScore(0,100,0,0)!==60) throw new Error('全优势应60');
  if(R.warScore(100,0,0,0)!==0) throw new Error('全劣势应0');
  const w = R.warScore(50,50,3,2);
  if(w!==30+9+4) throw new Error('50/50+战果应=43 got '+w);   // base30+wins9+raids4
});
test('raidWave: 规模随军力阶梯上升(总兵力)', () => {
  const a=R.raidWave({military:15}), b=R.raidWave({military:40}),
        c=R.raidWave({military:70}), d=R.raidWave({military:120});
  if(!(a.total<b.total && b.total<c.total && c.total<d.total))
    throw new Error('阶梯应递增: '+[a.total,b.total,c.total,d.total]);
  if(a.elite||b.elite) throw new Error('低阶不应elite');
  if(!c.elite||!d.elite) throw new Error('高阶应elite');
});

/* ---- 阶段E: 战术分流 ---- */
test('raidWave: trait → 战术分流(强攻/盗掠/围攻)', () => {
  if(R.raidWave({military:40,trait:'aggressive'}).tactic!=='assault')
    throw new Error('aggressive 应强攻');
  if(R.raidWave({military:40,trait:'trader'}).tactic!=='pillage')
    throw new Error('trader 应盗掠');
  if(R.raidWave({military:40,trait:'expansionist'}).tactic!=='siege')
    throw new Error('expansionist 应围攻');
  if(R.raidWave({military:40}).tactic!=='assault')
    throw new Error('无 trait 应回退强攻');
});
test('raidWave: 战术兵力系数——强攻×1.2 盗掠×0.7', () => {
  const base=5;                                 // military 40 档
  const a=R.raidWave({military:40,trait:'aggressive'});
  const p=R.raidWave({military:40,trait:'trader'});
  if(a.count!==Math.round(base*1.2)) throw new Error('强攻应'+Math.round(base*1.2)+' got '+a.count);
  if(p.count!==Math.round(base*0.7)) throw new Error('盗掠应'+Math.round(base*0.7)+' got '+p.count);
  if(p.count>=a.count) throw new Error('盗掠兵力应低于强攻');
});
test('raidWave: 军力≥90 拆两波且总量不缩水', () => {
  const d=R.raidWave({military:120,trait:'aggressive'});
  if(d.waves!==2) throw new Error('全面进攻应拆2波');
  if(d.total<10) throw new Error('两波合计不应少于原10×1.2的一半×2, got '+d.total);
  if(d.count*d.waves!==d.total) throw new Error('total 应=count×waves');
  const c=R.raidWave({military:70,trait:'aggressive'});
  if(c.waves!==1) throw new Error('军力<90 应单波');
});
test('raidWave: label 带战术前缀', () => {
  const w=R.raidWave({military:40,trait:'expansionist'});
  if(w.label.indexOf('围攻')!==0) throw new Error('label 应带战术前缀 got '+w.label);
});
