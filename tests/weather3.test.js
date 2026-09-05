/* W3 效果接线 (issue #88 / ADR-15 / docs/adr/0006)
   seams: APH.Weather.{currentId, expectDur, expectRemain, weatherEffects}
           APH.Res.{suitResistOf, weatherMoveMul, exposureTick}
           APH.Combat.fsmStep (sightMul 乘法位置同 nightAggroMul)
   纯函数, 无 DOM。期望值手工推导, 数值唯一源 CFG.weather / CFG.items / CFG.enemy。
   极端清单以 exposureGain>0 为准: 雷暴/暴雪/热浪/寒潮/酸雨;
   大雨 wx_rain_heavy.exposureGain=0 (非极端, 定案)。 */
'use strict';
const W = window.APH.Weather;
const R = window.APH.Res;

/* ---------- 接线: 当前天气 id 读取(老档兜底) ---------- */
test('w3_currentId: 无 meta.weather → wx_clear (老档零迁移兜底)', () => {
  if (W.currentId({}) !== 'wx_clear') throw new Error('缺省应 wx_clear');
  if (W.currentId(null) !== 'wx_clear') throw new Error('null 应兜底 wx_clear');
  if (W.currentId({ weather: { id: 'wx_fog', t: 10 } }) !== 'wx_fog')
    throw new Error('应读 meta.weather.id, 实际: ' + W.currentId({ weather: { id: 'wx_fog' } }));
});

/* ---------- HUD: 预计时长 ---------- */
test('w3_expectDur: dur 区间中值 × dayLen (晴 3.5天=735s, 雷暴 1天=210s)', () => {
  const day = (APH.CFG.weather && APH.CFG.weather.dayLen) || 3600;
  const clear = W.expectDur('wx_clear');
  if (clear !== 3.5 * day) throw new Error('wx_clear 预计应 '+ (3.5*day) +'s, 实际: ' + clear);
  const thunder = W.expectDur('wx_thunder');
  if (thunder !== day) throw new Error('wx_thunder 预计应 '+day+'s, 实际: ' + thunder);
});

test('w3_expectRemain: 中值-已过 t, 超时不取负', () => {
  const day = (APH.CFG.weather && APH.CFG.weather.dayLen) || 3600;
  const r1 = W.expectRemain({ id: 'wx_thunder', t: 50 });
  if (r1 !== day - 50) throw new Error('剩 '+(day-50)+', 实际: ' + r1);
  const r2 = W.expectRemain({ id: 'wx_clear', t: 1e9 });
  if (r2 !== 0) throw new Error('超时应为 0(不取负), 实际: ' + r2);
});

/* ---------- 暴露接线判定: 极端清单 exposureGain>0 ---------- */
test('w3_extremeGate: 极端=exposureGain>0 (雷暴/暴雪/热浪/寒潮/酸雨); 大雨=0 非极端', () => {
  var EXTREME = ['wx_thunder', 'wx_blizzard', 'wx_heat', 'wx_cold', 'wx_acid'];
  var NORMAL  = ['wx_clear', 'wx_rain', 'wx_rain_heavy', 'wx_snow', 'wx_storm', 'wx_fog'];
  EXTREME.forEach(function(id){
    if (!(W.weatherEffects(id).exposureGain > 0))
      throw new Error(id + ' 应 exposureGain>0 (极端), 实际: ' + W.weatherEffects(id).exposureGain);
  });
  NORMAL.forEach(function(id){
    if (W.weatherEffects(id).exposureGain !== 0)
      throw new Error(id + ' exposureGain 应=0 (非极端), 实际: ' + W.weatherEffects(id).exposureGain);
  });
});

/* ---------- 减速乘子(玩家/居民共用纯函数) ---------- */
test('w3_speedMul表: 雨0.7/雪0.8/暴雪0.6/寒潮0.85/酸雨0.85, 晴=1', () => {
  var want = { wx_clear:1, wx_rain:0.7, wx_snow:0.8, wx_blizzard:0.6, wx_cold:0.85, wx_acid:0.85 };
  for (var id in want){
    var got = W.weatherEffects(id).speedMul;
    if (got !== want[id]) throw new Error(id + ' speedMul 应 ' + want[id] + ', 实际: ' + got);
  }
});

test('w3_moveMul: 室外×speedMul; 室内免; 寒潮+防寒服免; 服不串味', () => {
  var plain = { gear: null };
  if (R.weatherMoveMul(plain, 'wx_rain', 0.7, false) !== 0.7) throw new Error('雨室外应 0.7');
  if (R.weatherMoveMul(plain, 'wx_rain', 0.7, true) !== 1) throw new Error('室内应 1(免罚)');
  if (R.weatherMoveMul(plain, 'wx_cold', 0.85, false) !== 0.85) throw new Error('无服寒潮应 0.85');
  var ice = { gear: { tool: null, suit: 'it_suit_cryo', head: null } };
  if (R.weatherMoveMul(ice, 'wx_cold', 0.85, false) !== 1) throw new Error('寒潮+防寒服应免减速');
  if (R.weatherMoveMul(ice, 'wx_rain', 0.7, false) !== 0.7) throw new Error('防寒服不挡雨');
  var haz = { gear: { suit: 'it_suit_hazard' } };
  if (R.weatherMoveMul(haz, 'wx_cold', 0.85, false) !== 0.85) throw new Error('防酸服不挡寒潮');
  if (R.weatherMoveMul(null, 'wx_rain', 0.7, false) !== 0.7) throw new Error('空居民按无装 0.7');
});

/* ---------- 装备减免(纯函数) ---------- */
test('w3_suitResist: 防酸服 acidResist=0.8 / 防寒服 cryoResist=0.8 / 无装=0', () => {
  if (R.suitResistOf({ gear: { suit: 'it_suit_hazard' } }, 'acidResist') !== 0.8)
    throw new Error('防酸服抗性应 0.8');
  if (R.suitResistOf({ gear: { suit: 'it_suit_hazard' } }, 'cryoResist') !== 0)
    throw new Error('防酸服无寒抗');
  if (R.suitResistOf({ gear: { suit: 'it_suit_cryo' } }, 'cryoResist') !== 0.8)
    throw new Error('防寒服抗性应 0.8');
  if (R.suitResistOf({ gear: {} }, 'acidResist') !== 0) throw new Error('无装应 0');
  if (R.suitResistOf(null, 'acidResist') !== 0) throw new Error('空应 0');
});

test('w3_exposureTick: 酸雨+防酸服 暴露增 ×(1-0.8)=+2', () => {
  var hz = APH.Res.generate('w3hz', 222);
  hz.gear = { tool: null, suit: 'it_suit_hazard', head: null };
  hz.exposure = 0;
  APH.Res.exposureTick(hz, false, true, 'wx_acid');
  if (hz.exposure !== 2) throw new Error('防酸服酸雨应 +2 (10×0.2), 实际: ' + hz.exposure);

  var plain = APH.Res.generate('w3pl', 333);
  plain.exposure = 0;
  APH.Res.exposureTick(plain, false, true, 'wx_acid');
  if (plain.exposure !== 10) throw new Error('无服酸雨应 +10, 实际: ' + plain.exposure);

  var ri = APH.Res.generate('w3ri', 111);
  ri.exposure = 20;
  APH.Res.exposureTick(ri, false, true, 'wx_thunder');
  if (ri.exposure !== 30) throw new Error('雷暴室外应 +10 → 30, 实际: ' + ri.exposure);
});

test('w3_exposureTick: wx_acid 转化=感染(同 lw_night_acid 链), 热浪=外伤', () => {
  var a = APH.Res.generate('w3ac', 444);
  a.exposure = 85; a.ailments = [];
  APH.Res.exposureTick(a, false, true, 'wx_acid');
  if ((a.ailments[0] || {}).type !== 'infection') throw new Error('wx_acid 应感染病症');
  if (a.exposure >= 80) throw new Error('转化后 exposure 应回落');

  var b = APH.Res.generate('w3ht', 555);
  b.exposure = 85; b.ailments = [];
  APH.Res.exposureTick(b, false, true, 'wx_heat');
  if ((b.ailments[0] || {}).type !== 'wound') throw new Error('热浪应外伤病症');
});

/* ---------- 雾天敌人感知: enemySightMul 乘入 aggroR (nightAggroMul 同节奏) ---------- */
test('w3_fogSight: enemySightMul=0.7; fsmStep(sightMul) 0.85×aggroR 雾天不察觉/无雾察觉', () => {
  if (W.weatherEffects('wx_fog').enemySightMul !== 0.7) throw new Error('雾天感知应 0.7');
  if (W.weatherEffects('wx_clear').enemySightMul !== 1) throw new Error('晴应 1');
  var aggroR = APH.CFG.enemy.aggroR;
  var en = { state: 'idle' };
  var dist = aggroR * 0.85;   // 介于 0.7×aggroR 与 aggroR 之间
  var foggy = APH.Combat.fsmStep(en, { dist: dist, night: false, hpPct: 1, heardShot: false, sightMul: 0.7 });
  if (foggy !== 'idle') throw new Error('雾天 0.85×aggroR 应不察觉, 实际: ' + foggy);
  var clear = APH.Combat.fsmStep(en, { dist: dist, night: false, hpPct: 1, heardShot: false, sightMul: 1 });
  if (clear !== 'alert') throw new Error('无雾 0.85×aggroR 应察觉, 实际: ' + clear);
});

/* ---------- 农场 farmMul: 乘入 harvestMods 链(cropPlotTick lawMul) ---------- */
test('w3_farmMul: 雨+30%/雪0.6/暴雪0.3/酸雨0.5 乘入 cropPlotTick 生长', () => {
  var want = { wx_rain: 1.3, wx_snow: 0.6, wx_blizzard: 0.3, wx_acid: 0.5, wx_cold: 0.7 };
  for (var id in want){
    if (W.weatherEffects(id).farmMul !== want[id])
      throw new Error(id + ' farmMul 应 ' + want[id] + ', 实际: ' + W.weatherEffects(id).farmMul);
  }
  var p1 = APH.Colony.cropPlotTick({ stage: 0, t: 0 }, 2, 1, 0.5, 'crop_glow_shroom');
  var p2 = APH.Colony.cropPlotTick({ stage: 0, t: 0 }, 2, 1, 0.5 * 1.3, 'crop_glow_shroom');
  if (!(p2.t > p1.t)) throw new Error('雨乘子应加快生长 ' + p1.t + ' vs ' + p2.t);
  if (p1.t !== 0.65) throw new Error('(1+2×0.15)×0.5=0.65, 实际: ' + p1.t);
});
