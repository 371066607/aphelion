
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
test('raidWave: 规模随军力阶梯上升', () => {
  const a=R.raidWave({military:15}), b=R.raidWave({military:40}),
        c=R.raidWave({military:70}), d=R.raidWave({military:120});
  if(!(a.count<b.count && b.count<c.count && c.count<d.count))
    throw new Error('阶梯应递增');
  if(a.elite||b.elite) throw new Error('低阶不应elite');
  if(!c.elite||!d.elite) throw new Error('高阶应elite');
});
